"""
backend/app.py — Flask server for Triangle Splatting Control Node

Endpoints:
    POST /api/train      — start a training job, returns SSE stream
    POST /api/cancel     — cancel the running job
    GET  /api/status     — check if a job is running

Environment variables (.env):
    USE_MOCK=true        — use mock_engine.py instead of the real train.py
    MOCK_SPEED=10.0      — how many times faster than real-time the mock runs
    CORE_ENGINE_PATH     — path to core_engine/train.py (defaults to auto-detect)
    MOCK_ENGINE_PATH     — path to mock_engine.py (defaults to auto-detect)
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time
import cv2
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
CORS(app)  # Allow requests from the Vite dev server

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

USE_MOCK = os.environ.get("USE_MOCK", "true").lower() == "true"

# Resolve engine paths relative to this file's location
_here = os.path.dirname(os.path.abspath(__file__))
_repo_root = os.path.dirname(_here)

MOCK_ENGINE_PATH = os.environ.get(
    "MOCK_ENGINE_PATH",
    os.path.join(_here, "mock_engine.py")
)
CORE_ENGINE_PATH = os.environ.get(
    "CORE_ENGINE_PATH",
    os.path.join(_repo_root, "core_engine", "train.py")
)

UPLOAD_FOLDER = os.path.join(_here, "data")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ---------------------------------------------------------------------------
# Job state (single-job model — one training run at a time)
# ---------------------------------------------------------------------------

_lock       = threading.Lock()
_process    = None   # The running subprocess
_job_active = False  # Whether a job is currently running


def _get_engine_cmd(args: dict) -> list[str]:
    """
    Build the subprocess command for either the mock or real engine.
    Both accept identical CLI arguments.
    """
    if USE_MOCK:
        script = MOCK_ENGINE_PATH
    else:
        script = CORE_ENGINE_PATH

    cmd = [
        sys.executable, script,
        "-s", args["source_path"],
        "-m", args["model_path"],
    ]

    if args.get("outdoor"):
        cmd.append("--outdoor")
    if args.get("eval"):
        cmd.append("--eval")
    if args.get("iterations"):
        cmd += ["--iterations", str(args["iterations"])]

    return cmd


# ---------------------------------------------------------------------------
# SSE streaming
# ---------------------------------------------------------------------------

def _stream_training(cmd: list[str]) -> None:
    """
    Generator that:
      1. Spawns the engine subprocess
      2. Reads its stdout line by line
      3. Yields each line as an SSE event
    Runs inside a Flask Response generator.
    """
    global _process, _job_active

    def sse(data: str) -> str:
        """Format a string as a Server-Sent Event."""
        return f"data: {data}\n\n"

    def emit_json(obj: dict) -> str:
        return sse(json.dumps(obj))

    try:
        with _lock:
            _job_active = True

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,   # merge stderr into stdout
            text=True,
            bufsize=1,                   # line-buffered
            env={**os.environ, "MOCK_SPEED": os.environ.get("MOCK_SPEED", "10.0")},
        )

        with _lock:
            _process = process

        yield emit_json({"type": "started", "message": "Engine process started"})

        for raw_line in process.stdout:
            line = raw_line.rstrip()
            if not line:
                continue

            # The engine writes valid JSON — forward it directly
            try:
                obj = json.loads(line)
                yield sse(line)
            except json.JSONDecodeError:
                # Non-JSON output (e.g. Python tracebacks) — wrap it
                yield emit_json({"type": "log", "message": line})

        process.wait()

        if process.returncode != 0:
            yield emit_json({
                "type":    "error",
                "code":    "ENGINE_CRASH",
                "message": f"Engine exited with code {process.returncode}",
            })
        else:
            # If the engine didn't emit a 'complete' event itself, send one now
            yield emit_json({"type": "stream_end"})

    except FileNotFoundError:
        script = cmd[1] if len(cmd) > 1 else "unknown"
        yield emit_json({
            "type":    "error",
            "code":    "ENGINE_NOT_FOUND",
            "message": f"Engine script not found: {script}",
        })

    except Exception as exc:
        yield emit_json({
            "type":    "error",
            "code":    "INTERNAL_ERROR",
            "message": str(exc),
        })

    finally:
        with _lock:
            _process    = None
            _job_active = False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/train", methods=["POST"])
def train():
    """
    Start a training job.

    Request body (JSON):
        {
            "source_path": "/path/to/scene",
            "model_path":  "/path/to/output",
            "outdoor":     false,
            "eval":        true,
            "iterations":  30000   // optional
        }

    Response: SSE stream of JSON events.
    """
    global _job_active

    with _lock:
        if _job_active:
            return jsonify({
                "error": "A training job is already running. Cancel it first."
            }), 409

    body = request.get_json(silent=True) or {}

    # Validate required fields
    missing = [f for f in ("source_path", "model_path") if not body.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    cmd = _get_engine_cmd(body)

    return Response(
        _stream_training(cmd),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",   # Disable nginx proxy buffering
        },
    )


@app.route("/api/cancel", methods=["POST"])
def cancel():
    """Cancel the currently running training job."""
    global _process, _job_active

    with _lock:
        if not _job_active or _process is None:
            return jsonify({"message": "No job is running"}), 200

        try:
            # Send SIGTERM first; the engine should clean up and exit
            _process.terminate()
        except ProcessLookupError:
            pass

    return jsonify({"message": "Job cancellation requested"}), 200


@app.route("/api/status", methods=["GET"])
def status():
    """Return whether a training job is currently running."""
    with _lock:
        active = _job_active

    engine = "mock" if USE_MOCK else "real"
    return jsonify({"job_active": active, "engine": engine})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/api/upload", methods=["POST"])
def upload():
    """
    Upload a video and split it into frames.
    Returns a stream of progress events.
    """
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    video = request.files['video']
    if video.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    fps_raw = request.form.get('fps')
    print(f"[upload] Received fps raw: {fps_raw}")
    fps = float(fps_raw) if fps_raw else 2.0
    print(f"[upload] Using fps: {fps}")
    
    filename = secure_filename(video.filename)
    job_id = f"job_{int(time.time())}"
    job_dir = os.path.join(UPLOAD_FOLDER, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    video_path = os.path.join(job_dir, filename)
    video.save(video_path)

    def generate():
        def sse(data: dict):
            return f"data: {json.dumps(data)}\n\n"

        yield sse({"type": "status", "message": "Starting video processing..."})

        try:
            input_dir = os.path.join(job_dir, "input")
            os.makedirs(input_dir, exist_ok=True)

            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                yield sse({"type": "error", "message": "Could not open video file"})
                return

            # Try to get more accurate FPS
            video_fps_raw = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            # Use duration to verify FPS (CAP_PROP_FPS is often wrong)
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, total_frames - 1))
            duration_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            
            video_fps = video_fps_raw
            if duration_ms > 0 and total_frames > 0:
                calc_fps = (total_frames * 1000.0) / duration_ms
                # If they differ significantly, trust calculated one
                if abs(calc_fps - video_fps_raw) > 1.0:
                    video_fps = calc_fps
            
            if video_fps <= 0:
                video_fps = 30.0
                
            hop = video_fps / fps
            
            log_msg = f"Video stats: {video_fps:.2f} FPS (raw: {video_fps_raw:.2f}), {total_frames} frames, duration: {duration_ms/1000.0:.2f}s, target {fps} FPS -> hop {hop:.2f}"
            print(f"[upload] {log_msg}")
            yield sse({"type": "status", "message": log_msg})

            # Estimated frames to be extracted
            est_total = int(total_frames / hop) if hop > 0 else 0

            count = 0
            frame_idx = 0
            next_target_frame = 0
            
            last_progress_time = time.time()

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                if frame_idx >= next_target_frame:
                    frame_name = f"{count:05d}.jpg"
                    cv2.imwrite(os.path.join(input_dir, frame_name), frame)
                    count += 1
                    next_target_frame += hop
                
                frame_idx += 1

                # Throttle progress updates to ~10 per second
                if time.time() - last_progress_time > 0.1:
                    progress = int((frame_idx / total_frames) * 100) if total_frames > 0 else 0
                    yield sse({
                        "type": "progress", 
                        "progress": progress, 
                        "message": f"Extracting frames: {count} extracted..."
                    })
                    last_progress_time = time.time()

            cap.release()

            yield sse({
                "type": "complete", 
                "source_path": os.path.abspath(job_dir),
                "num_frames": count,
                "message": f"Successfully extracted {count} frames"
            })

        except Exception as e:
            yield sse({"type": "error", "message": str(e)})

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Dev server
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"[backend] USE_MOCK = {USE_MOCK}")
    print(f"[backend] Engine   = {MOCK_ENGINE_PATH if USE_MOCK else CORE_ENGINE_PATH}")
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)