"""
backend/app.py — Flask server for Triangle Splatting Control Node
"""

import json
import os
import signal
import subprocess
import sys
import threading

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

USE_MOCK = os.environ.get("USE_MOCK", "true").lower() == "true"

_here = os.path.dirname(os.path.abspath(__file__))
_repo_root = os.path.dirname(_here)

MOCK_ENGINE_PATH = os.environ.get("MOCK_ENGINE_PATH", os.path.join(_here, "mock_engine.py"))
CORE_ENGINE_PATH = os.environ.get("CORE_ENGINE_PATH", os.path.join(_repo_root, "core_engine", "train.py"))

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.join(_repo_root, "output"))
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Global State
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_process = None
_job_active = False

_conv_lock = threading.Lock()
_active_conversions = set()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_engine_cmd(args: dict) -> list[str]:
    script = MOCK_ENGINE_PATH if USE_MOCK else CORE_ENGINE_PATH
    cmd = [sys.executable, script, "-s", args["source_path"], "-m", args["model_path"]]
    if args.get("outdoor"): cmd.append("--outdoor")
    if args.get("eval"): cmd.append("--eval")
    if args.get("iterations"): cmd += ["--iterations", str(args["iterations"])]
    return cmd

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/models", methods=["GET"])
def list_models():
    models = []
    if os.path.exists(OUTPUT_DIR):
        for name in os.listdir(OUTPUT_DIR):
            path = os.path.join(OUTPUT_DIR, name)
            if os.path.isdir(path):
                pc_path = os.path.join(path, "point_cloud")
                checkpoints = []
                if os.path.exists(pc_path):
                    for d in os.listdir(pc_path):
                        if d.startswith("iteration_") and os.path.isdir(os.path.join(pc_path, d)):
                            checkpoints.append(d)
                checkpoints.sort(key=lambda x: int(x.split("_")[1]))
                models.append({
                    "name": name,
                    "has_off": os.path.exists(os.path.join(path, "model.off")),
                    "has_tsplat": os.path.exists(os.path.join(path, "model.tsplat")),
                    "checkpoints": checkpoints
                })
    return jsonify(models)

@app.route("/api/convert_tsplat", methods=["POST"])
def convert_to_tsplat():
    body = request.get_json()
    model_name = body.get("model_name")
    checkpoint = body.get("checkpoint")
    if not model_name or not checkpoint:
        return jsonify({"error": "Missing model_name or checkpoint"}), 400

    with _conv_lock:
        if f"tsplat_{model_name}" in _active_conversions:
            return jsonify({"error": "Conversion already in progress"}), 409
        _active_conversions.add(f"tsplat_{model_name}")

    try:
        checkpoint_path = os.path.join(OUTPUT_DIR, model_name, "point_cloud", checkpoint, "point_cloud_state_dict.pt")
        output_tsplat = os.path.join(OUTPUT_DIR, model_name, "model.tsplat")
        
        if not os.path.exists(checkpoint_path):
             checkpoint_path = os.path.join(OUTPUT_DIR, model_name, checkpoint, "point_cloud_state_dict.pt")
        
        if not os.path.exists(checkpoint_path):
            return jsonify({"error": f"Checkpoint not found: {checkpoint_path}"}), 404

        script = os.path.join(_repo_root, "core_engine", "export_web.py")
        core_engine_dir = os.path.join(_repo_root, "core_engine")
        env = os.environ.copy()
        env["PYTHONPATH"] = f"{core_engine_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"

        subprocess.run([sys.executable, script, "--checkpoint_path", checkpoint_path, "--output_path", output_tsplat], check=True, env=env)
        return jsonify({"message": "Splat export successful", "url": f"/api/serve/{model_name}/model.tsplat"})
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Export failed: {str(e)}"}), 500
    finally:
        with _conv_lock:
            _active_conversions.discard(f"tsplat_{model_name}")

@app.route("/api/serve/<path:filename>")
def serve_model_file(filename):
    """Serve files from the output directory."""
    # filename might be "my_model/model.tsplat"
    return send_from_directory(OUTPUT_DIR, filename)

@app.route("/api/convert", methods=["POST"])
def convert_to_off():
    body = request.get_json()
    model_name = body.get("model_name")
    checkpoint = body.get("checkpoint")
    if not model_name or not checkpoint:
        return jsonify({"error": "Missing model_name or checkpoint"}), 400

    with _conv_lock:
        if model_name in _active_conversions:
            return jsonify({"error": "Conversion already in progress"}), 409
        _active_conversions.add(model_name)

    try:
        checkpoint_path = os.path.join(OUTPUT_DIR, model_name, "point_cloud", checkpoint, "point_cloud_state_dict.pt")
        output_off = os.path.join(OUTPUT_DIR, model_name, "model.off")
        if not os.path.exists(checkpoint_path):
            checkpoint_path = os.path.join(OUTPUT_DIR, model_name, checkpoint, "point_cloud_state_dict.pt")
        if not os.path.exists(checkpoint_path):
            return jsonify({"error": f"Checkpoint not found: {checkpoint_path}"}), 404

        convert_script = os.path.join(_repo_root, "core_engine", "create_off.py")
        core_engine_dir = os.path.join(_repo_root, "core_engine")
        env = os.environ.copy()
        env["PYTHONPATH"] = f"{core_engine_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"

        subprocess.run([sys.executable, convert_script, "--checkpoint_path", checkpoint_path, "--output_name", output_off], check=True, env=env)
        return jsonify({"message": "Conversion successful", "url": f"/api/serve/{model_name}/model.off"})
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Conversion failed: {str(e)}"}), 500
    finally:
        with _conv_lock:
            _active_conversions.discard(model_name)

@app.route("/api/train", methods=["POST"])
def train():
    global _job_active
    with _lock:
        if _job_active: return jsonify({"error": "Job already running"}), 409
    body = request.get_json(silent=True) or {}
    missing = [f for f in ("source_path", "model_path") if not body.get(f)]
    if missing: return jsonify({"error": f"Missing fields: {missing}"}), 400
    cmd = _get_engine_cmd(body)
    return Response(_stream_training(cmd), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

def _stream_training(cmd):
    global _process, _job_active
    def sse(data): return f"data: {data}\n\n"
    def emit_json(obj): return sse(json.dumps(obj))
    try:
        with _lock: _job_active = True
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env={**os.environ, "MOCK_SPEED": os.environ.get("MOCK_SPEED", "10.0")})
        with _lock: _process = process
        yield emit_json({"type": "started", "message": "Engine process started"})
        for raw_line in process.stdout:
            line = raw_line.rstrip()
            if not line: continue
            try:
                json.loads(line)
                yield sse(line)
            except json.JSONDecodeError:
                yield emit_json({"type": "log", "message": line})
        process.wait()
        if process.returncode != 0:
            yield emit_json({"type": "error", "code": "ENGINE_CRASH", "message": f"Exit code {process.returncode}"})
        else:
            yield emit_json({"type": "stream_end"})
    except Exception as exc:
        yield emit_json({"type": "error", "code": "INTERNAL_ERROR", "message": str(exc)})
    finally:
        with _lock:
            _process = None
            _job_active = False

@app.route("/api/cancel", methods=["POST"])
def cancel():
    global _process, _job_active
    with _lock:
        if not _job_active or _process is None: return jsonify({"message": "No job"}), 200
        _process.terminate()
    return jsonify({"message": "Cancelled"})

@app.route("/api/status", methods=["GET"])
def status():
    with _lock: active = _job_active
    return jsonify({"job_active": active, "engine": "mock" if USE_MOCK else "real"})

@app.route("/api/models/<name>/config")
def get_model_config(name):
    config_path = os.path.join(OUTPUT_DIR, name, "cfg_args")
    if os.path.exists(config_path):
        with open(config_path, "r") as f: return jsonify({"config": f.read()})
    return jsonify({"error": "Not found"}), 404

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
