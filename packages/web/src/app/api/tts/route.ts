import { NextRequest, NextResponse } from "next/server";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { Readable } from "node:stream";

import { verifyAuthorizationHeader } from "../lib/openauth";

export const runtime = "nodejs";

const REGION =
  process.env.POLLY_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-southeast-2";

const pollyClient = new PollyClient({
  region: REGION,
});

function toReadableStream(audioStream: any): ReadableStream<Uint8Array> {
  if (!audioStream) {
    throw new Error("Polly returned no audio stream");
  }

  if (typeof ReadableStream !== "undefined" && audioStream instanceof ReadableStream) {
    return audioStream as ReadableStream<Uint8Array>;
  }

  if (audioStream instanceof Readable) {
    return Readable.toWeb(audioStream) as ReadableStream<Uint8Array>;
  }

  if (audioStream instanceof Uint8Array) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(audioStream);
        controller.close();
      },
    });
  }

  if (audioStream instanceof Blob) {
    return audioStream.stream() as ReadableStream<Uint8Array>;
  }

  if (typeof audioStream === "string") {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(audioStream);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(buffer);
        controller.close();
      },
    });
  }

  throw new Error("Unsupported Polly audio stream type");
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const verified = await verifyAuthorizationHeader(authorization);

  if ("err" in verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { text } = await request.json();
    const trimmedText = (text ?? "").toString().trim();

    if (!trimmedText) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const safeText = trimmedText.slice(0, 3000);

    const command = new SynthesizeSpeechCommand({
      Engine: "neural",
      VoiceId: "Aria",
      LanguageCode: "en-NZ",
      OutputFormat: "mp3",
      Text: safeText,
    });

    const result = await pollyClient.send(command);
    const stream = toReadableStream(result.AudioStream);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating Polly audio", error);
    return NextResponse.json(
      { error: "Unable to synthesize speech" },
      { status: 500 },
    );
  }
}
