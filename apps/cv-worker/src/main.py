"""Local runs: process one video and print a summary.

The pipeline itself lives in pipeline.py; this file only reads the command
line, calls run_pipeline and prints what came back.
"""
import argparse
from pathlib import Path

from config import DEFAULT_VIDEO, OUTPUT_DIR, ROBOT_NAMES
from pipeline import run_pipeline


def parse_args():
    parser = argparse.ArgumentParser(description="Computer Vision Worker")
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    parser.add_argument("--no-display", action="store_true", help="run without windows")
    return parser.parse_args()


def print_summary(result):
    total_frames = result.total_frames

    def pct(n):
        return f"{n} ({100 * n / max(total_frames, 1):.1f}%)"

    print(f"\nSegmentation summary ({total_frames} frames)")
    for robot_id, robot in result.robots.items():
        counts = robot.mask_regions
        print(
            f"  robot {robot_id} ({ROBOT_NAMES[robot_id]}): "
            f"1 region {pct(counts['one'])} | "
            f"none {pct(counts['none'])} | "
            f"2+ regions {pct(counts['many'])}"
        )

    print(f"\nDetection summary ({total_frames} frames)")
    for robot_id, robot in result.robots.items():
        print(
            f"  robot {robot_id} ({ROBOT_NAMES[robot_id]}): "
            f"detected {pct(robot.detected_frames)} | "
            f"missed {pct(total_frames - robot.detected_frames)}"
        )

    print(f"\nTracking summary ({total_frames} frames)")
    for robot_id, robot in result.robots.items():
        print(
            f"  robot {robot_id} ({ROBOT_NAMES[robot_id]}): "
            f"{total_frames} points | accepted {pct(robot.accepted_points)} | "
            f"rejected jumps {robot.rejected_jumps}"
        )

    print(f"\nSaved {result.rows} rows to {result.trajectories_path}")
    for robot in result.robots.values():
        if robot.heatmap_path is not None:
            print(f"Saved heatmap to {robot.heatmap_path}")


if __name__ == "__main__":
    args = parse_args()
    # data/output/<video name>/
    output_dir = OUTPUT_DIR / args.video.stem
    result = run_pipeline(args.video, output_dir, display=not args.no_display)
    print_summary(result)
