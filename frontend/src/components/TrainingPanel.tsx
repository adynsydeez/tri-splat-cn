/**
 * TrainingPanel.tsx
 *
 * Full training control UI. Drop this anywhere in your React app.
 * Uses useTrainingStream internally — no props required.
 */

import { useEffect, useRef, useState } from "react";
import { useTrainingStream, TrainingState, StartOptions } from "../hooks/useTrainingStream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  sourcePath:  string;
  modelPath:   string;
  outdoor:     boolean;
  eval:        boolean;
  iterations:  string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEta(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60)    return `${Math.round(seconds)}s`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  value: number;
  total: number;
}

function ProgressBar({ value, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: 6, height: 8, overflow: "hidden" }}>
      <div
        style={{
          width:        `${pct}%`,
          height:       "100%",
          background:   "var(--color-text-info)",
          borderRadius: 6,
          transition:   "width 0.3s ease",
        }}
      />
    </div>
  );
}

interface StatusBadgeProps {
  status: TrainingState["status"];
}

function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<string, { bg: string; color: string }> = {
    idle:      { bg: "var(--color-background-secondary)", color: "var(--color-text-secondary)" },
    running:   { bg: "var(--color-background-info)",      color: "var(--color-text-info)"      },
    complete:  { bg: "var(--color-background-success)",   color: "var(--color-text-success)"   },
    error:     { bg: "var(--color-background-danger)",    color: "var(--color-text-danger)"    },
    cancelled: { bg: "var(--color-background-warning)",   color: "var(--color-text-warning)"   },
  };
  const style = map[status] ?? map["idle"];
  return (
    <span
      style={{
        padding:      "2px 10px",
        borderRadius: 999,
        fontSize:     12,
        fontWeight:   500,
        background:   style.bg,
        color:        style.color,
      }}
    >
      {status}
    </span>
  );
}

interface LogConsoleProps {
  logs: string[];
}

function LogConsole({ logs }: LogConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      style={{
        background:   "var(--color-background-secondary)",
        border:       "1px solid var(--color-border-tertiary)",
        borderRadius: 8,
        padding:      "12px 14px",
        height:       260,
        overflowY:    "auto",
        fontFamily:   "var(--font-mono)",
        fontSize:     12,
        lineHeight:   1.7,
        color:        "var(--color-text-secondary)",
      }}
    >
      {logs.length === 0 && (
        <span style={{ color: "var(--color-text-tertiary)" }}>
          Waiting for output...
        </span>
      )}
      {logs.map((line, i) => {
        const isError = line.includes("ERROR") || line.includes("error");
        return (
          <div
            key={i}
            style={{ color: isError ? "var(--color-text-danger)" : undefined }}
          >
            {line}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TrainingPanel() {
  const { start, cancel, reset, state } = useTrainingStream();

  const [form, setForm] = useState<FormState>({
    sourcePath: "",
    modelPath:  "",
    outdoor:    false,
    eval:       true,
    iterations: "",
  });

  const isRunning = state.status === "running";
  const isDone    = (["complete", "error", "cancelled"] as TrainingState["status"][]).includes(state.status);
  const pct       = state.total > 0 ? Math.round((state.iteration / state.total) * 100) : 0;

  const handleStart = (): void => {
    const options: StartOptions = {
      sourcePath: form.sourcePath || "./data/garden",
      modelPath:  form.modelPath  || "./output/garden",
      outdoor:    form.outdoor,
      eval:       form.eval,
    };
    if (form.iterations) {
      options.iterations = parseInt(form.iterations, 10);
    }
    start(options);
  };

  const inputStyle: React.CSSProperties = {
    width:        "100%",
    padding:      "8px 10px",
    borderRadius: 6,
    border:       "1px solid var(--color-border-secondary)",
    background:   "var(--color-background-primary)",
    color:        "var(--color-text-primary)",
    fontSize:     14,
    boxSizing:    "border-box",
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 0", fontFamily: "var(--font-sans)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>
          Triangle Splatting
        </h2>
        <StatusBadge status={state.status} />
      </div>

      {/* Form */}
      <div style={{
        background:   "var(--color-background-secondary)",
        border:       "1px solid var(--color-border-tertiary)",
        borderRadius: 12,
        padding:      20,
        marginBottom: 20,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Scene path
            </label>
            <input
              style={inputStyle}
              value={form.sourcePath}
              placeholder="./data/garden"
              onChange={(e) => setForm((f) => ({ ...f, sourcePath: e.target.value }))}
              disabled={isRunning}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Output path
            </label>
            <input
              style={inputStyle}
              value={form.modelPath}
              placeholder="./output/garden"
              onChange={(e) => setForm((f) => ({ ...f, modelPath: e.target.value }))}
              disabled={isRunning}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Iterations (optional)
            </label>
            <input
              style={inputStyle}
              type="number"
              value={form.iterations}
              placeholder="30000"
              min={1000}
              step={1000}
              onChange={(e) => setForm((f) => ({ ...f, iterations: e.target.value }))}
              disabled={isRunning}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--color-text-primary)", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={form.outdoor}
                onChange={(e) => setForm((f) => ({ ...f, outdoor: e.target.checked }))}
                disabled={isRunning}
              />
              Outdoor scene
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--color-text-primary)", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={form.eval}
                onChange={(e) => setForm((f) => ({ ...f, eval: e.target.checked }))}
                disabled={isRunning}
              />
              Run evaluation
            </label>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          {!isRunning && !isDone && (
            <button
              onClick={handleStart}
              style={{
                padding:      "9px 20px",
                borderRadius: 6,
                border:       "none",
                background:   "var(--color-text-info)",
                color:        "#fff",
                fontWeight:   500,
                fontSize:     14,
                cursor:       "pointer",
              }}
            >
              Start training
            </button>
          )}

          {isRunning && (
            <button
              onClick={cancel}
              style={{
                padding:      "9px 20px",
                borderRadius: 6,
                border:       "1px solid var(--color-border-secondary)",
                background:   "transparent",
                color:        "var(--color-text-danger)",
                fontWeight:   500,
                fontSize:     14,
                cursor:       "pointer",
              }}
            >
              Cancel
            </button>
          )}

          {isDone && (
            <button
              onClick={reset}
              style={{
                padding:      "9px 20px",
                borderRadius: 6,
                border:       "1px solid var(--color-border-secondary)",
                background:   "transparent",
                color:        "var(--color-text-secondary)",
                fontWeight:   500,
                fontSize:     14,
                cursor:       "pointer",
              }}
            >
              New job
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {(isRunning || isDone) && (
        <div style={{
          background:   "var(--color-background-secondary)",
          border:       "1px solid var(--color-border-tertiary)",
          borderRadius: 12,
          padding:      20,
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
            <span style={{ color: "var(--color-text-secondary)" }}>
              Iteration {state.iteration.toLocaleString()} / {state.total.toLocaleString()} &nbsp;({pct}%)
            </span>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {isRunning
                ? `ETA ${formatEta(state.eta)}`
                : `Done in ${formatDuration(state.duration)}`}
            </span>
          </div>

          <ProgressBar value={state.iteration} total={state.total} />

          {state.loss != null && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--color-text-secondary)" }}>
              Loss:{" "}
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                {state.loss.toFixed(6)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {state.status === "error" && state.error && (
        <div style={{
          background:   "var(--color-background-danger)",
          border:       "1px solid var(--color-border-danger)",
          borderRadius: 8,
          padding:      "12px 16px",
          marginBottom: 20,
          fontSize:     14,
        }}>
          <div style={{ fontWeight: 500, color: "var(--color-text-danger)", marginBottom: 4 }}>
            {state.error.code}
          </div>
          <div style={{ color: "var(--color-text-danger)" }}>
            {state.error.message}
          </div>
        </div>
      )}

      {/* Completion */}
      {state.status === "complete" && (
        <div style={{
          background:   "var(--color-background-success)",
          border:       "1px solid var(--color-border-success)",
          borderRadius: 8,
          padding:      "12px 16px",
          marginBottom: 20,
          fontSize:     14,
          color:        "var(--color-text-success)",
        }}>
          Training complete! Output saved to:{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>{state.outputPath}</span>
        </div>
      )}

      {/* Log console */}
      {(isRunning || isDone) && <LogConsole logs={state.logs} />}
    </div>
  );
}