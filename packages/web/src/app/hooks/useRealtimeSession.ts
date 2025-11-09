import { useCallback, useRef, useState, useEffect } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebRTC,
  type RealtimeSessionConfig,
} from '@openai/agents/realtime';

import { audioFormatForCodec, applyCodecPreferences } from '../lib/codecUtils';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
  onAssistantMessage?: (itemId: string, text: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents: RealtimeAgent[];
  audioElement?: HTMLAudioElement;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
  disableModelAudio?: boolean;
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const connectingPromiseRef = useRef<Promise<void> | null>(null);
  const assistantItemDeliveredRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<
    SessionStatus
  >('DISCONNECTED');
  const { logClientEvent } = useEvent();

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({}, s);
    },
    [callbacks],
  );

  const { logServerEvent } = useEvent();

  const historyHandlers = useHandleSessionHistory({
    onAssistantMessage: callbacks.onAssistantMessage,
  }).current;

  const transportEventLogRef = useRef<{ seen: Set<string>; order: string[] }>({
    seen: new Set<string>(),
    order: [],
  });

  const getTextFromContent = (content?: any[]) => {
    if (!Array.isArray(content)) return '';
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        if (part.type === 'text' || part.type === 'output_text') {
          return part.text ?? '';
        }
        if (part.type === 'input_text') {
          return part.text ?? '';
        }
        if (part.type === 'audio') {
          return part.transcript ?? '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  };

  const notifyAssistantMessage = (itemId?: string, content?: any[]) => {
    const text = getTextFromContent(content);
    if (!itemId || !text) return;
    if (assistantItemDeliveredRef.current.has(itemId)) return;
    assistantItemDeliveredRef.current.add(itemId);
    callbacks.onAssistantMessage?.(itemId, text);
    console.log('[Realtime transport] onAssistantMessage triggered', {
      itemId,
      textPreview: text.slice(0, 80),
    });
  };

  const shouldLogTransportEvent = useCallback((event: any) => {
    const eventId = event?.event_id ?? event?.response?.id ?? event?.id;
    if (!eventId) {
      return true;
    }

    const { seen, order } = transportEventLogRef.current;
    if (seen.has(eventId)) {
      return false;
    }

    seen.add(eventId);
    order.push(eventId);

    if (order.length > 1000) {
      const overflow = order.splice(0, order.length - 1000);
      overflow.forEach((id) => seen.delete(id));
    }

    return true;
  }, []);

  function handleTransportEvent(event: any) {
    // Handle additional server events that aren't managed by the session
    if (
      event.type === "response.output_text.delta" ||
      event.type === "response.output_text.done" ||
      event.type === "response.output_item.done"
    ) {
      console.log('[Realtime transport]', event.type, event);
    }
    switch (event.type) {
      case "response.input_audio_transcript.delta": {
        historyHandlers.handleTranscriptionDelta({
          item_id: event.item_id,
          delta: event.delta,
        });
        break;
      }
      case "response.input_audio_transcript.done":
      case "conversation.item.input_audio_transcription.completed": {
        historyHandlers.handleTranscriptionCompleted({
          item_id: event.item_id,
          transcript: event.transcript,
        });
        break;
      }
      case "response.output_text.delta": {
        historyHandlers.handleTranscriptionDelta({
          item_id: event.item_id,
          delta: event.delta,
        });
        break;
      }
      case "response.output_text.done": {
        historyHandlers.handleTranscriptionCompleted({
          item_id: event.item_id,
          transcript: event.output_text,
        });
        break;
      }
      case "response.output_item.done": {
        const item = event.item;
        if (item?.type === 'message' && item?.role === 'assistant') {
          notifyAssistantMessage(item.id, item.content);
        }
        break;
      }
      default: {
        if (shouldLogTransportEvent(event)) {
          logServerEvent(event);
        }
        break;
      } 
    }
  }

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus')
      .toLowerCase(),
  );

  // Wrapper to pass current codec param
  const applyCodec = useCallback(
    (pc: RTCPeerConnection) => applyCodecPreferences(pc, codecParamRef.current),
    [],
  );

  const handleAgentHandoff = (item: any) => {
    const history = item.context.history;
    const lastMessage = history[history.length - 1];
    const agentName = lastMessage.name.split("transfer_to_")[1];
    callbacks.onAgentHandoff?.(agentName);
  };

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    // Log server errors
    session.on("error", (...args: any[]) => {
      logServerEvent({
        type: "error",
        message: args[0],
      });
    });

    // history events
    const handleError = (...args: any[]) => {
      logServerEvent({
        type: "error",
        message: args[0],
      });
    };

    session.on("error", handleError);
    session.on("agent_handoff", handleAgentHandoff);
    session.on("agent_tool_start", historyHandlers.handleAgentToolStart);
    session.on("agent_tool_end", historyHandlers.handleAgentToolEnd);
    session.on("history_updated", historyHandlers.handleHistoryUpdated);
    session.on("history_added", historyHandlers.handleHistoryAdded);
    session.on("guardrail_tripped", historyHandlers.handleGuardrailTripped);

    // additional transport events
    session.on("transport_event", handleTransportEvent);

    return () => {
      session.off("error", handleError);
      session.off("agent_handoff", handleAgentHandoff);
      session.off("agent_tool_start", historyHandlers.handleAgentToolStart);
      session.off("agent_tool_end", historyHandlers.handleAgentToolEnd);
      session.off("history_updated", historyHandlers.handleHistoryUpdated);
      session.off("history_added", historyHandlers.handleHistoryAdded);
      session.off("guardrail_tripped", historyHandlers.handleGuardrailTripped);
      session.off("transport_event", handleTransportEvent);
    };
  }, [historyHandlers, handleAgentHandoff, handleTransportEvent]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      audioElement,
      extraContext,
      outputGuardrails,
      disableModelAudio = false,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected
      const existingPromise = connectingPromiseRef.current;
      if (existingPromise) {
        return existingPromise;
      }

      const connectPromise = (async () => {
        updateStatus('CONNECTING');

        try {
          const ek = await getEphemeralKey();
          const rootAgent = initialAgents[0];

          // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
          //  simulate how the voice agent sounds over a PSTN/SIP phone call.
          const codecParam = codecParamRef.current;
          const audioFormat = audioFormatForCodec(codecParam);

          const transport = new OpenAIRealtimeWebRTC({
            audioElement: disableModelAudio ? undefined : audioElement,
            // Set preferred codec before offer creation
            changePeerConnection: async (pc: RTCPeerConnection) => {
              applyCodec(pc);
              return pc;
            },
          });

          const baseConfig: Partial<RealtimeSessionConfig> = {
            inputAudioFormat: audioFormat,
            inputAudioTranscription: {
              model: 'gpt-4o-mini-transcribe',
            },
            modalities: disableModelAudio ? ['text'] : ['text', 'audio'],
          };

          if (!disableModelAudio) {
            baseConfig.outputAudioFormat = audioFormat;
          }

          sessionRef.current = new RealtimeSession(rootAgent, {
            transport,
            model: 'gpt-4o-realtime-preview-2025-06-03',
            config: baseConfig,
            outputGuardrails: outputGuardrails ?? [],
            context: extraContext ?? {},
          });

          await sessionRef.current.connect({ apiKey: ek });
          updateStatus('CONNECTED');
        } catch (err) {
          sessionRef.current?.close();
          sessionRef.current = null;
          assistantItemDeliveredRef.current.clear();
          updateStatus('DISCONNECTED');
          throw err;
        }
      })();

      connectingPromiseRef.current = connectPromise;
      try {
        await connectPromise;
      } finally {
        connectingPromiseRef.current = null;
      }
    },
    [updateStatus],
  );

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    assistantItemDeliveredRef.current.clear();
    updateStatus('DISCONNECTED');
  }, [updateStatus]);

  const assertconnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertconnected();
    sessionRef.current!.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    sessionRef.current?.transport.sendEvent(ev);
  }, []);

  const mute = useCallback((m: boolean) => {
    sessionRef.current?.mute(m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    sessionRef.current.transport.sendEvent({ type: 'response.create' } as any);
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}
