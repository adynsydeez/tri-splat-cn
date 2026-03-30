"""
mock_engine.py — Fake Triangle Splatting trainer

Drop-in substitute for core_engine/train.py.
Accepts the same CLI arguments, streams the same JSON event format to stdout,
and simulates the full training lifecycle without needing a GPU.

Usage (mirrors real train.py):
    python mock_engine.py -s <scene_path> -m <output_path> [--outdoor] [--eval]

Event format (one JSON object per line on stdout):
    {"type": "log",      "message": "..."}
    {"type": "progress", "iteration": N, "total": N, "loss": 0.042, "eta_seconds": N}
    {"type": "error",    "code": "ERROR_CODE", "message": "..."}
    {"type": "complete", "output_path": "...", "duration_seconds": N}

To swap in the real engine: set USE_MOCK=false in your .env and point
the backend at core_engine/train.py instead.
"""

import argparse
import json
import math
import os
import random
import sys
import time


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def emit(obj: dict):
    """Write a single JSON event to stdout and flush immediately."""
    print(json.dumps(obj), flush=True)


def log(message: str):
    emit({"type": "log", "message": message})


def progress(iteration: int, total: int, loss: float, eta_seconds: int):
    emit({
        "type": "iteration",
        "iteration": iteration,
        "total": total,
        "loss": round(loss, 6),
        "eta_seconds": eta_seconds,
    })


def error(code: str, message: str):
    emit({"type": "error", "code": code, "message": message})


def complete(output_path: str, duration_seconds: int):
    emit({
        "type": "complete",
        "output_path": output_path,
        "duration_seconds": duration_seconds,
    })


# ---------------------------------------------------------------------------
# Simulated training phases
# ---------------------------------------------------------------------------

TOTAL_ITERATIONS = 30_000

# How often to emit a progress event (every N iterations)
LOG_EVERY = 100

# Speed multiplier — 1.0 = roughly real-time feel, higher = faster mock
SPEED = float(os.environ.get("MOCK_SPEED", "10.0"))


def sleep(real_seconds: float):
    """Sleep scaled by SPEED so tests can run faster."""
    time.sleep(real_seconds / SPEED)


def simulate_loss(iteration: int) -> float:
    """
    Mimic a realistic loss curve:
      - Fast drop in early iterations (coarse structure forming)
      - Slower refinement mid-training
      - Plateau with small noise at the end
    """
    base = 2.5 * math.exp(-iteration / 4000) + 0.04
    noise = random.gauss(0, 0.001)
    return max(0.01, base + noise)


def phase_colmap(scene_path: str):
    """Simulate loading and validating the COLMAP sparse reconstruction."""
    log("Reading COLMAP sparse reconstruction...")
    sleep(0.6)

    sparse_dir = os.path.join(scene_path, "sparse")
    if not os.path.exists(scene_path):
        error(
            "SCENE_NOT_FOUND",
            f"Scene directory not found: {scene_path}"
        )
        sys.exit(1)

    log(f"Scene path: {scene_path}")
    sleep(0.3)

    # Simulate finding camera data
    n_cameras = random.randint(80, 220)
    n_points  = random.randint(80_000, 250_000)
    log(f"Found {n_cameras} cameras, {n_points:,} sparse 3D points")
    sleep(0.4)

    log("Normalising scene scale...")
    sleep(0.3)
    log("Computing scene bounding box...")
    sleep(0.2)


def phase_initialise(outdoor: bool):
    """Simulate triangle initialisation from the point cloud."""
    log("Initialising triangles from sparse point cloud...")
    sleep(0.5)

    n_triangles = random.randint(90_000, 130_000)
    log(f"Created {n_triangles:,} initial triangles")
    sleep(0.3)

    if outdoor:
        log("Outdoor mode: adjusting sky handling and exposure normalisation")
        sleep(0.2)

    log("Building spatial acceleration structure (simple-knn)...")
    sleep(0.4)
    log("Computing initial triangle colours from SH coefficients...")
    sleep(0.3)
    log("Initialisation complete. Starting training loop.")
    sleep(0.2)


def phase_train(total: int, output_path: str):
    """Simulate the main training loop, emitting progress events."""
    start_time = time.time()

    # Densification happens at these milestones
    densify_milestones = {1_000, 2_000, 3_000, 4_000, 5_000, 7_500, 10_000}
    prune_milestones   = {15_000, 20_000, 25_000}
    checkpoint_every   = 5_000

    iteration = 0
    while iteration < total:
        iteration = min(iteration + LOG_EVERY, total)
        loss = simulate_loss(iteration)

        elapsed   = time.time() - start_time
        rate      = iteration / elapsed if elapsed > 0 else 1
        remaining = (total - iteration) / rate if rate > 0 else 0

        progress(iteration, total, loss, int(remaining))

        # Densification / pruning messages at milestones
        for milestone in sorted(densify_milestones):
            if iteration - LOG_EVERY < milestone <= iteration:
                n_new = random.randint(2_000, 8_000)
                log(f"[iter {milestone:,}] Densification: +{n_new:,} triangles (loss={loss:.4f})")
                sleep(0.15)

        for milestone in sorted(prune_milestones):
            if iteration - LOG_EVERY < milestone <= iteration:
                n_pruned = random.randint(5_000, 20_000)
                log(f"[iter {milestone:,}] Pruning low-opacity triangles: -{n_pruned:,} removed")
                sleep(0.1)

        # Checkpoint saves
        if iteration % checkpoint_every == 0 and iteration > 0:
            ckpt = os.path.join(output_path, f"point_cloud/iteration_{iteration}")
            log(f"Saving checkpoint → {ckpt}")
            sleep(0.2)

        # Tiny sleep between batches so the stream isn't a wall of text
        sleep(0.05)

    return time.time() - start_time


def phase_evaluate(output_path: str):
    """Simulate render + metrics evaluation."""
    log("Rendering test views for evaluation...")
    sleep(0.8)

    test_views = random.randint(24, 40)
    log(f"Rendering {test_views} test images at full resolution...")

    for i in range(1, test_views + 1):
        if i % 8 == 0 or i == test_views:
            log(f"  Rendered {i}/{test_views} views")
        sleep(0.04)

    psnr  = round(random.uniform(26.5, 29.5), 2)
    ssim  = round(random.uniform(0.82, 0.91), 4)
    lpips = round(random.uniform(0.18, 0.26), 4)

    log(f"Evaluation complete:")
    log(f"  PSNR  = {psnr} dB")
    log(f"  SSIM  = {ssim}")
    log(f"  LPIPS = {lpips}")

    metrics_path = os.path.join(output_path, "results.json")
    log(f"Metrics saved → {metrics_path}")


# ---------------------------------------------------------------------------
# Argument parsing (mirrors core_engine/train.py)
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Triangle Splatting trainer (mock mode — no GPU required)"
    )
    parser.add_argument("-s", "--source_path", required=True,
                        help="Path to the scene (COLMAP or NeRF synthetic)")
    parser.add_argument("-m", "--model_path", required=True,
                        help="Output path for the trained model")
    parser.add_argument("--outdoor", action="store_true",
                        help="Enable outdoor scene settings")
    parser.add_argument("--eval", action="store_true",
                        help="Run evaluation after training")
    parser.add_argument("--iterations", type=int, default=TOTAL_ITERATIONS,
                        help=f"Number of training iterations (default: {TOTAL_ITERATIONS})")

    # Passthrough flags the real engine accepts — we silently accept them too
    parser.add_argument("--resolution",   type=int,   default=-1)
    parser.add_argument("--white_background", action="store_true")
    parser.add_argument("--sh_degree",    type=int,   default=3)
    parser.add_argument("--lambda_normal", type=float, default=0.0)
    parser.add_argument("--densify_from_iter", type=int, default=500)
    parser.add_argument("--densify_until_iter", type=int, default=15_000)
    parser.add_argument("--densification_interval", type=int, default=100)
    parser.add_argument("--opacity_reset_interval",  type=int, default=3_000)

    return parser.parse_args()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    scene_path  = args.source_path
    output_path = args.model_path
    outdoor     = args.outdoor
    do_eval     = args.eval
    total_iters = args.iterations

    log("=" * 60)
    log("Triangle Splatting — MOCK MODE (no GPU required)")
    log("=" * 60)
    log(f"Scene:      {scene_path}")
    log(f"Output:     {output_path}")
    log(f"Iterations: {total_iters:,}")
    log(f"Outdoor:    {outdoor}")
    log(f"Eval:       {do_eval}")
    log("")

    overall_start = time.time()

    # Phase 1 — COLMAP / scene validation
    phase_colmap(scene_path)

    # Phase 2 — Triangle initialisation
    phase_initialise(outdoor)

    # Phase 3 — Training loop
    train_duration = phase_train(total_iters, output_path)

    # Phase 4 — Optional evaluation
    if do_eval:
        phase_evaluate(output_path)

    total_duration = int(time.time() - overall_start)

    log("")
    log(f"Training finished in {total_duration}s")
    complete(output_path, total_duration)


if __name__ == "__main__":
    main()