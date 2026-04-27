/**
 * useTrainingStream.ts
 *
 * React hook that connects to the backend SSE stream and exposes clean
 * training state to your components.
 *
 * Usage:
 *   const { start, cancel, reset, state } = useTrainingStream()
 */

import { useCallback, useRef, useState } from "react";

const API_URL = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL || "http://localhost:5000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrainingStatus = "idle" | "uploading" | "running" | "complete" | "error" | "cancelled";

export interface TrainingError {
  code: string;
  message: string;
}

export interface TrainingState {
  status:             TrainingStatus;
  uploadProgress:     number;       // 0-100
  processingProgress: number;       // 0-100
  iteration:          number;
  total:              number;
  loss:               number | null;
  eta:                number | null;        // estimated seconds remaining
  logs:               string[];
  error:              TrainingError | null;
  outputPath:         string | null;
  duration:           number | null;        // total seconds, set on completion
  sourcePath:         string | null;
}


export interface StartOptions {
  sourcePath?: string;
  modelPath:   string;
  outdoor?:    boolean;
  eval?:       boolean;
  iterations?: number;
}

export interface UseTrainingStreamReturn {
  uploadVideo: (file: File, fps: number) => Promise<string | null>;
  start:       (options: StartOptions) => Promise<void>;
  cancel:      () => Promise<void>;
  reset:       () => void;
  state:       TrainingState;
}

// ---------------------------------------------------------------------------
// SSE event shapes emitted by the backend
// ---------------------------------------------------------------------------

interface StartedEvent   { type: "started";    message: string }
interface LogEvent       { type: "log";         message: string }
interface IterationEvent { type: "iteration";   iteration: number; total: number; loss: number; eta_seconds: number }
interface CompleteEvent  { type: "complete";    output_path: string; duration_seconds: number }
interface ErrorEvent     { type: "error";       code: string; message: string }
interface StreamEndEvent { type: "stream_end" }

type EngineEvent =
  | StartedEvent
  | LogEvent
  | IterationEvent
  | CompleteEvent
  | ErrorEvent
  | StreamEndEvent;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: TrainingState = {
  status:         "idle",
  uploadProgress: 0,
  iteration:      0,
  total:          30000,
  loss:       null,
  eta:        null,
  logs:       [],
  error:      null,
  outputPath: null,
  duration:   null,
  sourcePath: null,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTrainingStream(): UseTrainingStreamReturn {
  const [state, setState] = useState<TrainingState>(INITIAL_STATE);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const appendLog = (message: string) =>
    setState((prev) => ({ ...prev, logs: [...prev.logs, message] }));

  const handleEvent = useCallback((raw: string) => {
    let event: EngineEvent;
    try {
      event = JSON.parse(raw) as EngineEvent;
    } catch {
      appendLog(raw);
      return;
    }

    switch (event.type) {
      case "started":
        setState((prev) => ({ ...prev, status: "running" }));
        break;

      case "log":
        appendLog(event.message);
        break;

      case "iteration":
        setState((prev) => ({
          ...prev,
          status:    "running",
          iteration: event.iteration,
          total:     event.total,
          loss:      event.loss,
          eta:       event.eta_seconds,
        }));
        break;

      case "complete":
        setState((prev) => ({
          ...prev,
          status:     "complete",
          outputPath: event.output_path,
          duration:   event.duration_seconds,
          iteration:  prev.total,
        }));
        break;

      case "error":
        setState((prev) => ({
          ...prev,
          status: "error",
          error:  { code: event.code, message: event.message },
        }));
        appendLog(`ERROR [${event.code}]: ${event.message}`);
        break;

      case "stream_end":
        setState((prev) =>
          prev.status === "running"
            ? { ...prev, status: "complete" }
            : prev
        );
        break;

      default:
        appendLog(JSON.stringify(event));
    }
  }, []);

  // ------------------------------------------------------------------
  // uploadVideo()
  // ------------------------------------------------------------------

  const uploadVideo = useCallback(
    async (file: File, fps: number): Promise<string | null> => {
      setState((prev) => ({ 
        ...prev, 
        status: "uploading", 
        uploadProgress: 0,
        processingProgress: 0,
        logs: [`Uploading video: ${file.name}...`] 
      }));

      return new Promise(async (resolve) => {
        try {
          const formData = new FormData();
          formData.append("video", file);
          formData.append("fps", fps.toString());

          // We'll use fetch because it handles streaming responses much better than XHR.
          // Note: fetch doesn't have an easy "upload progress" callback, but for local/high-speed 
          // development, the "Processing" phase is what actually takes time.
          const res = await fetch(`${API_URL}/api/upload`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            throw new Error(`Upload failed: ${res.statusText}`);
          }

          if (!res.body) {
            throw new Error("No response body");
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const rawData = line.slice(6);
                let data;
                try {
                  data = JSON.parse(rawData);
                } catch {
                  continue;
                }

                if (data.type === "progress" && data.progress !== undefined) {
                  setState(prev => ({ 
                    ...prev, 
                    uploadProgress: 100, // Upload is done if we are seeing processing events
                    processingProgress: data.progress 
                  }));
                }
                
                if (data.message) {
                  appendLog(data.message);
                }

                if (data.type === "complete" && data.source_path) {
                  setState(prev => ({ 
                    ...prev, 
                    status: "idle", 
                    sourcePath: data.source_path,
                    processingProgress: 100 
                  }));
                  resolve(data.source_path);
                  return;
                }

                if (data.type === "error") {
                  throw new Error(data.message || "Unknown server error");
                }
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setState((prev) => ({
            ...prev,
            status: "error",
            error: { code: "UPLOAD_ERROR", message: msg }
          }));
          resolve(null);
        }
      });
    },
    []
  );

  // ------------------------------------------------------------------
  // start()
  // ------------------------------------------------------------------

  const start = useCallback(
    async (options: StartOptions): Promise<void> => {
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }

      const finalSourcePath = options.sourcePath || state.sourcePath;

      if (!finalSourcePath) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: { code: "NO_SOURCE", message: "No source path available. Upload a video first." }
        }));
        return;
      }

      setState((prev) => ({ ...prev, status: "running" }));
      appendLog("Starting training...");

      try {
        const res = await fetch(`${API_URL}/api/train`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_path: finalSourcePath,
            model_path:  options.modelPath,
            outdoor:     options.outdoor  ?? false,
            eval:        options.eval     ?? false,
            ...(options.iterations != null ? { iterations: options.iterations } : {}),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          setState((prev) => ({
            ...prev,
            status: "error",
            error:  { code: "HTTP_ERROR", message: body.error ?? res.statusText },
          }));
          return;
        }

        if (!res.body) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error:  { code: "NO_BODY", message: "Response had no readable body." },
          }));
          return;
        }

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        const readChunk = async (): Promise<void> => {
          const { done, value } = await reader.read();

          if (done) {
            setState((prev) =>
              prev.status === "running"
                ? { ...prev, status: "complete" }
                : prev
            );
            readerRef.current = null;
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            for (const line of part.split("\n")) {
              if (line.startsWith("data: ")) {
                handleEvent(line.slice(6));
              }
            }
          }

          await readChunk();
        };

        await readChunk();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          status: "error",
          error:  { code: "NETWORK_ERROR", message },
        }));
      }
    },
    [handleEvent, state.sourcePath]
  );

  // ------------------------------------------------------------------
  // cancel()
  // ------------------------------------------------------------------

  const cancel = useCallback(async (): Promise<void> => {
    if (readerRef.current) {
      await readerRef.current.cancel();
      readerRef.current = null;
    }

    await fetch(`${API_URL}/api/cancel`, { method: "POST" }).catch(() => {});

    setState((prev) => ({ ...prev, status: "cancelled" }));
  }, []);

  // ------------------------------------------------------------------
  // reset()
  // ------------------------------------------------------------------

  const reset = useCallback((): void => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setState(INITIAL_STATE);
  }, []);

  return { uploadVideo, start, cancel, reset, state };
}