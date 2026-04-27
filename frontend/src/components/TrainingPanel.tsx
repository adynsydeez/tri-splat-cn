/**
 * TrainingPanel.tsx
 *
 * Full training control UI. Drop this anywhere in your React app.
 * Uses useTrainingStream internally — no props required.
 */

import { useEffect, useRef, useState } from "react";
import { useTrainingStream, TrainingState, StartOptions } from "../hooks/useTrainingStream";
import { VideoUploadWidget, VideoUploadState } from "./VideoUploadWidget";
import { FramerateSlider } from "./FramerateSlider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormState {
  video:       VideoUploadState;
  framerate:   number;
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
    <div className="w-full h-3 bg-gray-300 rounded-lg overflow-hidden shadow-inner">
      <div
        className="h-full bg-gradient-to-r from-primary to-primary-dark transition-all duration-500 rounded-lg shadow-md shadow-primary/30"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface StatusBadgeProps {
  status: TrainingState["status"];
}

function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    idle:      { bg: "bg-gray-100", color: "text-gray-600", border: "border-gray-300" },
    running:   { bg: "bg-blue-50", color: "text-primary", border: "border-blue-200" },
    complete:  { bg: "bg-green-50", color: "text-success", border: "border-green-200" },
    error:     { bg: "bg-red-50", color: "text-error", border: "border-red-200" },
    cancelled: { bg: "bg-amber-50", color: "text-warning", border: "border-amber-200" },
  };
  const style = map[status] ?? map["idle"];
  return (
    <span
      className={`inline-block px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${style.bg} ${style.color} ${style.border}`}
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
    <div className="w-full h-72 bg-gray-900 border border-gray-700 rounded-lg p-3.5 overflow-y-auto font-mono text-sm leading-relaxed text-gray-300 shadow-inner">
      {logs.length === 0 && (
        <span className="text-gray-600">
          Waiting for output...
        </span>
      )}
      {logs.map((line, i) => {
        const isError = line.includes("ERROR") || line.includes("error");
        const isWarning = line.includes("WARNING") || line.includes("warning");
        const isSuccess = line.includes("success") || line.includes("complete") || line.includes("COMPLETE");
        
        let colorClass = "text-gray-300";
        if (isError) colorClass = "text-error";
        else if (isWarning) colorClass = "text-warning";
        else if (isSuccess) colorClass = "text-success";
        
        return (
          <div key={i} className={colorClass}>
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
  const { uploadVideo, start, cancel, reset, state } = useTrainingStream();

  const [form, setForm] = useState<FormState>({
    video:       { file: null, filename: "" },
    framerate:   24,
    modelPath:   "",
    outdoor:     false,
    eval:        true,
    iterations:  "",
  });

  const isUploading = state.status === "uploading";
  const isRunning   = state.status === "running";
  const isDone      = (["complete", "error", "cancelled"] as TrainingState["status"][]).includes(state.status);
  const isUploaded  = !!state.sourcePath;
  const pct         = state.total > 0 ? Math.round((state.iteration / state.total) * 100) : 0;

  const handleUpload = async (): Promise<void> => {
    if (!form.video.file) return;
    await uploadVideo(form.video.file, form.framerate);
  };

  const handleStart = (): void => {
    if (!state.sourcePath) {
      alert("Please upload a video file first");
      return;
    }

    const options: StartOptions = {
      modelPath:  form.modelPath || "./output/model",
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
    padding:      "10px 12px",
    borderRadius: 6,
    border:       "1px solid #ddd",
    background:   "#fff",
    color:        "#222",
    fontSize:     14,
    boxSizing:    "border-box",
    boxShadow:    "0 1px 3px rgba(0, 0, 0, 0.05)",
    transition:   "all 0.2s ease",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <h2 className="text-3xl font-bold text-gray-900 m-0">
          Triangle Splatting
        </h2>
        <StatusBadge status={state.status} />
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
        {/* Video Upload Section */}
        <div className="mb-5">
          <VideoUploadWidget
            value={form.video}
            onChange={(video) => {
              setForm((f) => ({ ...f, video }));
              if (state.sourcePath) reset(); // Reset if file changes
            }}
            disabled={isUploading || isRunning}
          />
        </div>

        {/* Upload/Processing Progress */}
        {(isUploading || state.processingProgress > 0) && !isUploaded && (
          <div className="mb-5 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
            <div className="flex justify-between mb-2 text-xs font-semibold text-primary uppercase tracking-wider">
              <span>{state.processingProgress > 0 ? "Extracting Frames..." : "Uploading Video..."}</span>
              <span>{state.processingProgress > 0 ? state.processingProgress : state.uploadProgress}%</span>
            </div>
            <ProgressBar 
              value={state.processingProgress > 0 ? state.processingProgress : state.uploadProgress} 
              total={100} 
            />
            {state.processingProgress > 0 && (
              <div className="mt-2 text-[10px] text-blue-600 font-medium">
                Using OpenCV to split video at {form.framerate} FPS...
              </div>
            )}
          </div>
        )}

        {/* Framerate Slider */}
        {form.video.file && (
          <div className="mb-5">
            <FramerateSlider
              value={form.framerate}
              onChange={(fps) => setForm((f) => ({ ...f, framerate: fps }))}
              disabled={isUploading || isRunning || isUploaded}
              min={1}
              max={20}
              step={1}
            />
          </div>
        )}

        {/* Action buttons - Step 1: Upload */}
        {!isUploaded && !isUploading && !isRunning && !isDone && (
          <div className="mb-5">
            <button
              onClick={handleUpload}
              disabled={!form.video.file}
              className={`px-6 py-2.5 font-semibold text-sm rounded transition-all duration-200 shadow-lg ${
                form.video.file 
                  ? "bg-primary text-white shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5" 
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              Upload & Process Video
            </button>
          </div>
        )}

        {/* Step 2: Training Parameters (only visible after upload) */}
        {isUploaded && !isRunning && !isDone && (
          <div className="border-t border-gray-100 pt-5 mt-5 animate-in fade-in slide-in-from-top-4 duration-500">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[10px]">✓</span>
              Video processed. Configure training:
            </h3>
            
            {/* Output Path */}
            <div className="mb-4.5">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
                Output path (optional)
              </label>
              <input
                style={inputStyle}
                value={form.modelPath}
                placeholder="./output/model"
                onChange={(e) => setForm((f) => ({ ...f, modelPath: e.target.value }))}
                disabled={isRunning}
              />
            </div>

            {/* Grid with Iterations and Checkboxes */}
            <div className="grid grid-cols-3 gap-3.5 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
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

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-900 font-medium">
                  <input
                    type="checkbox"
                    checked={form.outdoor}
                    onChange={(e) => setForm((f) => ({ ...f, outdoor: e.target.checked }))}
                    disabled={isRunning}
                    className="w-[18px] h-[18px] cursor-pointer accent-primary"
                  />
                  Outdoor
                </label>
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-900 font-medium">
                  <input
                    type="checkbox"
                    checked={form.eval}
                    onChange={(e) => setForm((f) => ({ ...f, eval: e.target.checked }))}
                    disabled={isRunning}
                    className="w-[18px] h-[18px] cursor-pointer accent-primary"
                  />
                  Eval
                </label>
              </div>
            </div>

            <button
              onClick={handleStart}
              className="px-6 py-2.5 bg-gradient-to-br from-primary to-primary-dark text-white font-semibold text-sm rounded transition-all duration-200 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5"
            >
              Start Training
            </button>
          </div>
        )}

        {/* Action buttons for running/done state */}
        <div className="flex gap-3">
          {isRunning && (
            <button
              onClick={cancel}
              className="px-6 py-2.5 bg-white border-1.5 border-error text-error font-semibold text-sm rounded transition-all duration-200 shadow-sm shadow-error/20 hover:bg-red-50 hover:shadow-lg hover:shadow-error/30"
            >
              Cancel
            </button>
          )}

          {isDone && (
            <button
              onClick={reset}
              className="px-6 py-2.5 bg-white border-1.5 border-gray-300 text-gray-600 font-semibold text-sm rounded transition-all duration-200 shadow-sm shadow-black/8 hover:bg-gray-50 hover:border-gray-500 hover:shadow-lg hover:shadow-black/12"
            >
              New job
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {(isRunning || isDone) && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 shadow-sm">
          <div className="flex justify-between mb-3.5 text-sm">
            <span className="text-gray-600 font-semibold">
              Iteration {state.iteration.toLocaleString()} / {state.total.toLocaleString()} &nbsp;({pct}%)
            </span>
            <span className="text-gray-600 font-semibold">
              {isRunning
                ? `ETA ${formatEta(state.eta)}`
                : `Done in ${formatDuration(state.duration)}`}
            </span>
          </div>

          <ProgressBar value={state.iteration} total={state.total} />

          {state.loss != null && (
            <div className="mt-3.5 text-sm text-gray-600">
              Loss:{" "}
              <span className="font-mono text-primary font-semibold">
                {state.loss.toFixed(6)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {state.status === "error" && state.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm shadow-sm shadow-error/10">
          <div className="font-semibold text-error mb-1.5">
            {state.error.code}
          </div>
          <div className="text-error">
            {state.error.message}
          </div>
        </div>
      )}

      {/* Completion */}
      {state.status === "complete" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 text-sm text-success shadow-sm shadow-success/10">
          <div className="font-semibold mb-1.5">
            ✓ Training complete!
          </div>
          <div>
            Output saved to:{" "}
            <span className="font-mono font-medium">{state.outputPath}</span>
          </div>
        </div>
      )}

      {/* Log console */}
      {(isRunning || isDone) && <LogConsole logs={state.logs} />}
    </div>
  );
}