"use client";

import { useCallback, useRef, type RefObject } from "react";

interface UsePollyPlaybackOptions {
  audioElementRef: RefObject<HTMLAudioElement | null>;
  getAccessToken: () => Promise<string | null>;
}

export function usePollyPlayback({
  audioElementRef,
  getAccessToken,
}: UsePollyPlaybackOptions) {
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const abortControllerRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stopCurrentPlayback = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cleanupObjectUrl();
    const el = audioElementRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }, [audioElementRef, cleanupObjectUrl]);

  const resetQueue = useCallback(() => {
    queueRef.current = Promise.resolve();
  }, []);

  const stopPlayback = useCallback(() => {
    stopCurrentPlayback();
    resetQueue();
  }, [stopCurrentPlayback, resetQueue]);

  const pipeStreamToMediaSource = useCallback(
    async (
      mediaSource: MediaSource,
      stream: ReadableStream<Uint8Array>,
      signal: AbortSignal,
    ) => {
      await new Promise<void>((resolve, reject) => {
        const handleSourceOpen = () => {
          mediaSource.removeEventListener("sourceopen", handleSourceOpen);

          let sourceBuffer: SourceBuffer;
          try {
            sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("Unable to create SourceBuffer"),
            );
            return;
          }

          const reader = stream.getReader();

          const appendChunk = async (chunk: Uint8Array) => {
            if (!chunk?.length) return;

            await new Promise<void>((res, rej) => {
              const handleUpdate = () => {
                sourceBuffer.removeEventListener("error", handleError);
                res();
              };
              const handleError = () => {
                sourceBuffer.removeEventListener("updateend", handleUpdate);
                rej(new Error("Failed to append chunk"));
              };

              sourceBuffer.addEventListener("updateend", handleUpdate, {
                once: true,
              });
              sourceBuffer.addEventListener("error", handleError, { once: true });

              try {
                const buffer = new Uint8Array(chunk).buffer as ArrayBuffer;
                sourceBuffer.appendBuffer(buffer);
              } catch (err) {
                sourceBuffer.removeEventListener("updateend", handleUpdate);
                sourceBuffer.removeEventListener("error", handleError);
                rej(err as Error);
              }
            });
          };

          const pump = async () => {
            try {
              while (true) {
                if (signal.aborted) {
                  await reader.cancel();
                  reject(
                    new DOMException("Synthesis aborted", "AbortError"),
                  );
                  return;
                }

                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                  await appendChunk(value);
                }
              }

              const finalize = () => {
                try {
                  mediaSource.endOfStream();
                } catch {
                  // ignore end-of-stream errors (e.g. already closed)
                }
                resolve();
              };

              if (!sourceBuffer.updating) {
                finalize();
              } else {
                sourceBuffer.addEventListener("updateend", finalize, {
                  once: true,
                });
              }
            } catch (err) {
              reject(err as Error);
            }
          };

          void pump();
        };

        mediaSource.addEventListener("sourceopen", handleSourceOpen);
        mediaSource.addEventListener(
          "error",
          (event) => {
            reject(
              event instanceof ErrorEvent
                ? event.error ?? new Error(event.message)
                : new Error("MediaSource error"),
            );
          },
          { once: true },
        );
      });
    },
    [],
  );

  const waitForPlaybackEnd = useCallback(
    (el: HTMLAudioElement, signal: AbortSignal) => {
      return new Promise<void>((resolve) => {
        if (el.ended || el.paused) {
          resolve();
          return;
        }

        const cleanup = () => {
          el.removeEventListener("ended", handleEnded);
          signal.removeEventListener("abort", handleAbort as EventListener);
        };

        const handleEnded = () => {
          cleanup();
          resolve();
        };

        const handleAbort = () => {
          cleanup();
          resolve();
        };

        el.addEventListener("ended", handleEnded, { once: true });
        signal.addEventListener("abort", handleAbort as EventListener, {
          once: true,
        });
      });
    },
    [],
  );

  const streamText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const el = audioElementRef.current;
      if (!el) return;

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Missing access token for Polly TTS");
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Polly synthesis failed (${response.status})`);
      }

      const mediaSource = new MediaSource();
      const objectUrl = URL.createObjectURL(mediaSource);
      cleanupObjectUrl();
      objectUrlRef.current = objectUrl;

      el.src = objectUrl;

      const playPromise = el
        .play()
        .catch((err) => console.warn("Unable to auto-play Polly audio", err));

      const streamPromise = pipeStreamToMediaSource(
        mediaSource,
        response.body,
        controller.signal,
      );

      await Promise.all([streamPromise, playPromise]);
      await waitForPlaybackEnd(el, controller.signal);
      cleanupObjectUrl();
    },
    [
      audioElementRef,
      cleanupObjectUrl,
      getAccessToken,
      pipeStreamToMediaSource,
      waitForPlaybackEnd,
    ],
  );

  const enqueueSpeech = useCallback(
    (text: string) => {
      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(() => streamText(text))
        .catch((err) => {
          console.error("Polly playback error", err);
        });
    },
    [streamText],
  );

  return {
    enqueueSpeech,
    stopPlayback,
    cancelCurrent: stopCurrentPlayback,
    resetQueue,
  };
}
