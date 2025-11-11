import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { InvalidWebhookSignatureError } from "openai/error";
import type {
    RealtimeCallIncomingWebhookEvent,
    UnwrapWebhookEvent,
} from "openai/resources/webhooks";

import {
    RealtimeSession,
    type RealtimeClientMessage,
    type RealtimeSessionConfig,
    type RealtimeSessionOptions,
} from "@openai/agents/realtime";
import { OpenAIRealtimeSIP } from "@openai/agents-realtime";
import { kiwiChatAgent } from "@/app/agentConfigs/kiwiAgent";

export const runtime = "nodejs";

const REALTIME_MODEL = process.env.REALTIME_MODEL ?? "gpt-realtime";

const voiceAgent = kiwiChatAgent;

const sessions = new Map<string, RealtimeSession>();
const agentVoice = voiceAgent.voice ?? "alloy";
const PHONE_TRANSPORT = "twilio-sip-trunk";

const WELCOME_GREETING =
    "Kia ora! You're talking with the Kiwi accent demo assistant. How can I help today?";

const SIP_PROVIDER_METADATA = {
    agent: voiceAgent.name,
    transport: PHONE_TRANSPORT,
} as const;

const responseCreateEvent = {
    type: "response.create",
    response: {
        instructions: `Say to the caller: ${WELCOME_GREETING}`,
    },
} satisfies RealtimeClientMessage;

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    console.info("[Realtime webhook] Received POST payload length:", rawBody.length);

    const openaiResources = getOpenAIResources();
    if (!openaiResources) {
        console.error("[Realtime webhook] Missing OPENAI credentials; cannot handle webhook.");
        return NextResponse.json(
            { error: "Server misconfiguration: missing OpenAI credentials" },
            { status: 500 },
        );
    }

    const { client: openai, secrets } = openaiResources;

    let event: UnwrapWebhookEvent;
    try {
        event = await openai.webhooks.unwrap(rawBody, request.headers);
        console.info("[Realtime webhook] Webhook event verified:", event.type);
    } catch (error) {
        if (error instanceof InvalidWebhookSignatureError) {
            console.warn("[Realtime webhook] Invalid signature received.");
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }
        console.error("[Realtime webhook] Failed to verify webhook payload.", error);
        return NextResponse.json(
            { error: "Webhook verification failed" },
            { status: 500 },
        );
    }

    if (!isRealtimeCallIncoming(event)) {
        console.info("[Realtime webhook] Non-realtime event ignored:", event.type);
        return NextResponse.json({ ok: true });
    }

    const callId = event.data.call_id;
    console.info("[Realtime webhook] Incoming realtime call detected:", { callId });
    const accepted = await acceptIncomingCall(callId, openai);

    if (!accepted) {
        console.error("[Realtime webhook] Call acceptance failed.", { callId });
        return NextResponse.json(
            { error: "Failed to accept realtime call" },
            { status: 500 },
        );
    }

    console.info("[Realtime webhook] Call accepted; scheduling connection.", { callId });
    connectWithDelay(callId, secrets.apiKey);

    const response = NextResponse.json({ ok: true });
    response.headers.set("Authorization", `Bearer ${secrets.apiKey}`);
    return response;
}

function isRealtimeCallIncoming(
    event: UnwrapWebhookEvent,
): event is RealtimeCallIncomingWebhookEvent {
    return event.type === "realtime.call.incoming";
}

async function acceptIncomingCall(callId: string, openai: OpenAI): Promise<boolean> {
    try {
        console.info("[Realtime webhook] Building SIP config for call.", { callId });
        const initialConfig = await OpenAIRealtimeSIP.buildInitialConfig(
            voiceAgent,
            getSessionOptions(),
        );
        console.info("[Realtime webhook] Accepting call via OpenAI realtime API.", { callId });
        await openai.realtime.calls.accept(callId, initialConfig);
        console.info("[Realtime webhook] Call acceptance succeeded.", { callId });
        return true;
    } catch (error) {
        console.error("[Realtime webhook] Error while accepting call.", error);
        return false;
    }
}

function connectWithDelay(callId: string, apiKey: string, delayMs = 250) {
    setTimeout(() => {
        voiceAgentTask(callId, apiKey).catch((error) => {
            console.error("[Realtime webhook] WebSocket task failed.", {
                callId,
                error,
            });
        });
    }, delayMs);
}

async function voiceAgentTask(callId: string, apiKey: string): Promise<void> {
    if (sessions.has(callId)) {
        console.warn("[Realtime webhook] Session already active for call.", { callId });
        return;
    }

    const sipTransport = new OpenAIRealtimeSIP({
        useInsecureApiKey: true,
    });

    const sessionOptions = getSessionOptions();
    const session = new RealtimeSession(voiceAgent, {
        ...sessionOptions,
        transport: sipTransport,
    });
    console.info("[Realtime webhook] RealtimeSession created; connecting to call.", { callId });

    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) {
            return;
        }
        cleanedUp = true;
        sipTransport.off("connection_change", handleConnectionChange);
        sessions.delete(callId);
        session.close();
    };

    const handleConnectionChange = (status: string) => {
        console.info("[Realtime webhook] SIP transport connection status changed.", {
            callId,
            status,
        });
        if (status === "disconnected") {
            cleanup();
        }
    };

    sipTransport.on("connection_change", handleConnectionChange);
    sessions.set(callId, session);

    try {
        await session.connect({
            apiKey,
            model: REALTIME_MODEL,
            callId,
        });
        console.info("[Realtime webhook] Session attached to SIP call, sending greeting.", { callId });

        session.transport.sendEvent(responseCreateEvent);
        console.info("[Realtime webhook] Greeting event dispatched.", { callId });
    } catch (error) {
        cleanup();
        throw error;
    }
}

function getSessionOptions(): Partial<RealtimeSessionOptions> {
    return {
        model: REALTIME_MODEL,
        config: buildSessionConfigOverrides(),
    };
}

function buildSessionConfigOverrides(): Partial<RealtimeSessionConfig> {
    return {
        outputModalities: ["audio", "text"],
        audio: {
            input: {
                turnDetection: {
                    type: "semantic_vad",
                    interruptResponse: true,
                },
            },
            output: {
                voice: agentVoice,
            },
        },
        providerData: {
            metadata: SIP_PROVIDER_METADATA,
        },
    };
}

type OpenAISecretBundle = {
    apiKey: string;
    webhookSecret: string;
};

type OpenAIResources = {
    client: OpenAI;
    secrets: OpenAISecretBundle;
};

let cachedOpenAI: OpenAI | null = null;
let cachedSecrets: OpenAISecretBundle | null = null;

function getOpenAIResources(): OpenAIResources | null {
    const secrets = resolveSecretBundle();
    if (!secrets) {
        return null;
    }

    if (
        !cachedOpenAI ||
        !cachedSecrets ||
        cachedSecrets.apiKey !== secrets.apiKey ||
        cachedSecrets.webhookSecret !== secrets.webhookSecret
    ) {
        cachedOpenAI = new OpenAI({
            apiKey: secrets.apiKey,
            webhookSecret: secrets.webhookSecret,
        });
        cachedSecrets = secrets;
    }

    return { client: cachedOpenAI, secrets };
}

function resolveSecretBundle(): OpenAISecretBundle | null {
    const apiKey = process.env.OPENAI_API_KEY;
    const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;

    if (!apiKey || !webhookSecret) {
        return null;
    }

    return { apiKey, webhookSecret };
}
