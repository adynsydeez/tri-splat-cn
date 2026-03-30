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

export type TrainingStatus = "idle" | "running" | "complete" | "error" | "cancelled";

export interface TrainingError {
  code: string;
  message: string;
}

export interface TrainingState {
  status:     TrainingStatus;
  iteration:  number;
  total:      number;
  loss:       number | null;
  eta:        number | null;        // estimated seconds remaining
  logs:       string[];
  error:      TrainingError | null;
  outputPath: string | null;
  duration:   number | null;        // total seconds, set on completion
}

export interface StartOptions {
  sourcePath:  string;
  modelPath:   string;
  outdoor?:    boolean;
  eval?:       boolean;
  iterations?: number;
}

export interface UseTrainingStreamReturn {
  start:  (options: StartOptions) => Promise<void>;
  cancel: () => Promise<void>;
  reset:  () => void;
  state:  TrainingState;
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
  status:     "idle",
  iteration:  0,
  total:      30000,
  loss:       null,
  eta:        null,
  logs:       [],
  error:      null,
  outputPath: null,
  duration:   null,
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
  // start()
  // ------------------------------------------------------------------

  const start = useCallback(
    async (options: StartOptions): Promise<void> => {
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }

      setState({ ...INITIAL_STATE, status: "running", logs: [] });

      try {
        const res = await fetch(`${API_URL}/api/train`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_path: options.sourcePath,
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
    [handleEvent]
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

  return { start, cancel, reset, state };
}