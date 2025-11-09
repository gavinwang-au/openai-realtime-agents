"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Events from "./components/Events";
import BottomToolbar from "./components/BottomToolbar";

// Types
import { SessionStatus } from "@/app/types";

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useAuth } from "@/app/contexts/AuthContext";
import { useRealtimeSession } from "./hooks/useRealtimeSession";

// Agent configs
import { kiwiAgentScenario } from '@/app/agentConfigs/kiwiAgent'

import useAudioDownload from "./hooks/useAudioDownload";
import { usePollyPlayback } from "./hooks/usePollyPlayback";

function App() {
  const searchParams = useSearchParams()!;

  // ---------------------------------------------------------------------
  // Codec selector – lets you toggle between wide-band Opus (48 kHz)
  // and narrow-band PCMU/PCMA (8 kHz) to hear what the agent sounds like on
  // a traditional phone line and to validate ASR / VAD behaviour under that
  // constraint.
  //
  // We read the `?codec=` query-param and rely on the `changePeerConnection`
  // hook (configured in `useRealtimeSession`) to set the preferred codec
  // before the offer/answer negotiation.
  // ---------------------------------------------------------------------
  const urlCodec = searchParams.get("codec") || "opus";

  // Agents SDK doesn't currently support codec selection so it is now forced 
  // via global codecPatch at module load 

  const {
    addTranscriptMessage,
    addTranscriptBreadcrumb,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();
  const auth = useAuth();

  const [selectedAgentName, setSelectedAgentName] = useState<string>(
    kiwiAgentScenario[0]?.name ?? "",
  );

  const MIN_PTT_AUDIO_MS = 250;
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const pollyAudioRef = useRef<HTMLAudioElement | null>(null);
  const spokenItemIdsRef = useRef<Set<string>>(new Set());
  const pttHoldStartRef = useRef<number | null>(null);
  // Ref to identify whether the latest agent switch came from an automatic handoff
  const handoffTriggeredRef = useRef(false);

  const pollyAudioElement = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.preload = 'auto';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }, []);

  useEffect(() => {
    if (pollyAudioElement) {
      pollyAudioRef.current = pollyAudioElement;
    }
  }, [pollyAudioElement]);

  useEffect(() => {
    if (pollyAudioElement) {
      audioElementRef.current = pollyAudioElement;
    }
  }, [pollyAudioElement]);

  useEffect(() => {
    return () => {
      pollyAudioElement?.remove();
    };
  }, [pollyAudioElement]);

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return true;
      const stored = localStorage.getItem('audioPlaybackEnabled');
      return stored ? stored === 'true' : true;
    },
  );

  // Initialize the recording hook.
  const { startRecording, stopRecording, downloadRecording } =
    useAudioDownload();

  const {
    enqueueSpeech: enqueuePollySpeech,
    stopPlayback: stopPollyPlayback,
    resetQueue: resetPollyQueue,
  } = usePollyPlayback({
    audioElementRef: pollyAudioRef,
    getAccessToken: async () => (await auth.getToken()) ?? null,
  });

  const handleAssistantMessage = useCallback(
    (itemId: string, text: string) => {
      console.log('[Polly TTS] assistant message received', {
        itemId,
        text,
        audioEnabled: isAudioPlaybackEnabled,
      });

      if (!isAudioPlaybackEnabled) {
        console.log('[Polly TTS] audio disabled, skipping');
        return;
      }

      if (spokenItemIdsRef.current.has(itemId)) {
        console.log('[Polly TTS] skipping already-spoken item', itemId);
        return;
      }

      console.log('[Polly TTS] enqueue', { itemId, text });
      spokenItemIdsRef.current.add(itemId);
      enqueuePollySpeech(text);
    },
    [isAudioPlaybackEnabled, enqueuePollySpeech],
  );

  const {
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    interrupt: sessionInterrupt,
    mute,
  } = useRealtimeSession({
    onConnectionChange: (s) => setSessionStatus(s as SessionStatus),
    onAgentHandoff: (agentName: string) => {
      handoffTriggeredRef.current = true;
      setSelectedAgentName(agentName);
    },
    onAssistantMessage: handleAssistantMessage,
  });

  const stopExternalAudio = useCallback(() => {
    stopPollyPlayback();
  }, [stopPollyPlayback]);

  const interrupt = useCallback(() => {
    stopExternalAudio();
    sessionInterrupt();
  }, [sessionInterrupt, stopExternalAudio]);

  useEffect(() => {
    if (sessionStatus === "DISCONNECTED") {
      spokenItemIdsRef.current.clear();
      resetPollyQueue();
      stopExternalAudio();
    }
  }, [sessionStatus, resetPollyQueue, stopExternalAudio]);

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    try {
      sendEvent(eventObj);
      logClientEvent(eventObj, eventNameSuffix);
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }
  };

  useEffect(() => {
    if (!auth.loggedIn) return;
    if (!selectedAgentName) return;
    connectToRealtime();
  }, [selectedAgentName, auth.loggedIn]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && selectedAgentName) {
      const currentAgent = kiwiAgentScenario.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Agent: ${selectedAgentName}`, currentAgent);
      updateSession(!handoffTriggeredRef.current);
      // Reset flag after handling so subsequent effects behave normally
      handoffTriggeredRef.current = false;
    }
  }, [selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession();
    }
  }, [isPTTActive]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");

    const accessToken = await auth.getToken();
    if (!accessToken) {
      logClientEvent(
        { reason: "missing_access_token" },
        "error.session_token_request_failed",
      );
      setSessionStatus("DISCONNECTED");
      return null;
    }

    const tokenResponse = await fetch("/api/session", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!tokenResponse.ok) {
      logClientEvent(
        { status: tokenResponse.status },
        "error.session_token_request_failed",
      );
      if (tokenResponse.status === 401) {
        auth.logout();
      }
      setSessionStatus("DISCONNECTED");
      return null;
    }

    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async () => {
    if (!auth.loggedIn) return;
    if (sessionStatus !== "DISCONNECTED") return;
    setSessionStatus("CONNECTING");

    try {
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) {
        setSessionStatus("DISCONNECTED");
        return;
      }

      const reorderedAgents = [...kiwiAgentScenario];
      const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
      if (idx > 0) {
        const [agent] = reorderedAgents.splice(idx, 1);
        reorderedAgents.unshift(agent);
      }

      await connect({
        getEphemeralKey: async () => EPHEMERAL_KEY,
        initialAgents: reorderedAgents,
        disableModelAudio: true,
        extraContext: {
          addTranscriptBreadcrumb,
        },
      });
    } catch (err) {
      console.error("Error connecting via SDK:", err);
      setSessionStatus("DISCONNECTED");
    }
  };

  const disconnectFromRealtime = () => {
    stopExternalAudio();
    disconnect();
    setSessionStatus("DISCONNECTED");
    setIsPTTUserSpeaking(false);
  };

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);

    sendClientEvent({
      type: 'conversation.item.create',
      item: {
        id,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    sendClientEvent({ type: 'response.create' }, '(simulated user text message)');
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    // Reflect Push-to-Talk UI state by (de)activating server VAD on the
    // backend. The Realtime SDK supports live session updates via the
    // `session.update` event.
    const turnDetection = isPTTActive
      ? null
      : {
          type: 'server_vad',
          threshold: 0.9,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        };

    sendEvent({
      type: 'session.update',
      session: {
        turn_detection: turnDetection,
      },
    });

    // Send an initial 'hi' message to trigger the agent to greet the user
    if (shouldTriggerResponse) {
      sendSimulatedUserMessage('hi');
    }
    return;
  }

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    interrupt();

    try {
      sendUserText(userText.trim());
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }

    setUserText("");
  };

  const handleTalkButtonDown = () => {
    if (sessionStatus !== 'CONNECTED') return;
    interrupt();

    setIsPTTUserSpeaking(true);
    pttHoldStartRef.current = performance.now();
    sendClientEvent({ type: 'input_audio_buffer.clear' }, 'clear PTT buffer');

    // No placeholder; we'll rely on server transcript once ready.
  };

  const handleTalkButtonUp = () => {
    if (sessionStatus !== 'CONNECTED' || !isPTTUserSpeaking)
      return;

    setIsPTTUserSpeaking(false);
    const heldMs = pttHoldStartRef.current
      ? performance.now() - pttHoldStartRef.current
      : 0;
    pttHoldStartRef.current = null;

    if (heldMs < MIN_PTT_AUDIO_MS) {
      logClientEvent({ heldMs }, 'info.ptt_hold_too_short');
      return;
    }

    sendClientEvent({ type: 'input_audio_buffer.commit' }, 'commit PTT');
    sendClientEvent({ type: 'response.create' }, 'trigger response PTT');
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setSessionStatus("DISCONNECTED");
    } else {
      connectToRealtime();
    }
  };

  // Because we need a new connection, refresh the page when codec changes
  const handleCodecChange = (newCodec: string) => {
    const url = new URL(window.location.toString());
    url.searchParams.set("codec", newCodec);
    window.location.replace(url.toString());
  };

  useEffect(() => {
    const storedPushToTalkUI = localStorage.getItem("pushToTalkUI");
    if (storedPushToTalkUI) {
      setIsPTTActive(storedPushToTalkUI === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAudioPlaybackEnabled = localStorage.getItem(
      "audioPlaybackEnabled"
    );
    if (storedAudioPlaybackEnabled) {
      setIsAudioPlaybackEnabled(storedAudioPlaybackEnabled === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("pushToTalkUI", isPTTActive.toString());
  }, [isPTTActive]);

  useEffect(() => {
    localStorage.setItem("logsExpanded", isEventsPaneExpanded.toString());
  }, [isEventsPaneExpanded]);

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        // Mute and pause to avoid brief audio blips before pause takes effect.
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }

    // Toggle server-side audio stream mute so bandwidth is saved when the
    // user disables playback. 
    try {
      mute(!isAudioPlaybackEnabled);
    } catch (err) {
      console.warn('Failed to toggle SDK mute', err);
    }
  }, [isAudioPlaybackEnabled]);

  // Ensure mute state is propagated to transport right after we connect or
  // whenever the SDK client reference becomes available.
  useEffect(() => {
    if (sessionStatus === 'CONNECTED') {
      try {
        mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn('mute sync after connect failed', err);
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled]);

  useEffect(() => {
    if (!isAudioPlaybackEnabled) {
      stopExternalAudio();
    }
  }, [isAudioPlaybackEnabled, stopExternalAudio]);

  useEffect(() => {
    if (sessionStatus !== "CONNECTED") {
      stopRecording();
      return;
    }

    const el = audioElementRef.current;
    if (!el) return;

    if (typeof (el as any).captureStream === "function") {
      let cancelled = false;
      let loggedFailure = false;

      const ensureStream = () => {
        if (cancelled) return;

        try {
          const capture =
            (el as any).captureStream?.() ?? (el as any).mozCaptureStream?.();
          if (capture) {
            startRecording(capture as MediaStream);
            return;
          }
        } catch (err) {
          if (!loggedFailure) {
            console.warn("Unable to capture Polly audio stream", err);
            loggedFailure = true;
          }
        }

        requestAnimationFrame(ensureStream);
      };

      ensureStream();

      return () => {
        cancelled = true;
        stopRecording();
      };
    } else if (el.srcObject) {
      startRecording(el.srcObject as MediaStream);
      return () => {
        stopRecording();
      };
    }

    return () => {
      stopRecording();
    };
  }, [sessionStatus]);

  if (!auth.loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100 text-gray-800">
        <span className="text-lg font-medium">Loading authentication…</span>
      </div>
    );
  }

  if (!auth.loggedIn) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-100 text-gray-800">
        <p className="text-xl font-semibold">Sign in to use the demo</p>
        <button
          onClick={() => void auth.login()}
          className="rounded-lg bg-black px-4 py-2 text-white shadow hover:bg-gray-900"
        >
          Continue with email code
        </button>
      </div>
    );
  }

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="p-5 text-lg font-semibold flex justify-between items-center">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          <div>
            <Image
              src="/openai-logomark.svg"
              alt="OpenAI Logo"
              width={20}
              height={20}
              className="mr-2"
            />
          </div>
          <div>
            Voice <span className="text-gray-500">Agents</span>
          </div>
        </div>
        <div className="flex items-center">

          <div className="ml-6 flex items-center gap-3">
            <span className="text-sm text-gray-600">
              Signed in{auth.email ? ` as ${auth.email}` : ""}
            </span>
            <button
              onClick={() => auth.logout()}
              className="rounded border border-gray-300 px-3 py-1 text-sm font-medium hover:bg-gray-200"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={handleSendTextMessage}
          downloadRecording={downloadRecording}
          canSend={
            sessionStatus === "CONNECTED"
          }
        />

        <Events isExpanded={isEventsPaneExpanded} />
      </div>

      <BottomToolbar
        sessionStatus={sessionStatus}
        onToggleConnection={onToggleConnection}
        isPTTActive={isPTTActive}
        setIsPTTActive={setIsPTTActive}
        isPTTUserSpeaking={isPTTUserSpeaking}
        handleTalkButtonDown={handleTalkButtonDown}
        handleTalkButtonUp={handleTalkButtonUp}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
        codec={urlCodec}
        onCodecChange={handleCodecChange}
      />
    </div>
  );
}

export default App;
