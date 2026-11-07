import argparse
from pathlib import Path

import cv2

from capture import VideoCapture
from config import (
    BLUR_KERNEL, DEFAULT_VIDEO, MAX_SPEED_PX_PER_FRAME, MIN_CONTOUR_AREA, MORPH_KERNEL,
    ROBOT_COLORS, ROBOT_NAMES,
)
from debug import show_masks
from detection import detect_robots
from preprocessing import preprocess
from segmentation import count_regions, segment_all
from tracking import Tracker


def parse_args():
    parser = argparse.ArgumentParser(description="Computer Vision Worker")
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    parser.add_argument("--no-display", action="store_true", help="run without windows")
    return parser.parse_args()


def cv_worker(video_path, display=True):
    video = VideoCapture(video_path)

    # Mask validation: per robot, how many frames had 0, 1 or 2+ regions.
    # A good segmentation has exactly 1 region in (almost) every frame.
    stats = {robot_id: {"none": 0, "one": 0, "many": 0} for robot_id in ROBOT_COLORS}
    # Detection: per robot, in how many frames it was found
    detected = {robot_id: 0 for robot_id in ROBOT_COLORS}
    # Tracking: one TrajectoryPoint per robot per frame
    tracker = Tracker(ROBOT_COLORS, MAX_SPEED_PX_PER_FRAME)
    frame_index = 0

    try:
        while True:
            frame = video.read_frame()

            if frame is None:
                break

            # Pre-processing
            frame_hsv = preprocess(frame, BLUR_KERNEL)

            # Segmentation
            masks = segment_all(frame_hsv, ROBOT_COLORS, MORPH_KERNEL)

            # Validation
            regions = {robot_id: count_regions(mask) for robot_id, mask in masks.items()}
            for robot_id, count in regions.items():
                key = "none" if count == 0 else "one" if count == 1 else "many"
                stats[robot_id][key] += 1

            # Detection: {robot_id: Detection or None}
            detections = detect_robots(masks, MIN_CONTOUR_AREA)
            for robot_id, detection in detections.items():
                if detection is not None:
                    detected[robot_id] += 1

            # Tracking: seconds since the start of the video
            timestamp_s = round(frame_index / video.fps, 3)
            tracker.update(frame_index, timestamp_s, detections)

            # Display // Just for tests
            if display:
                show_masks(
                    frame, masks, regions, ROBOT_NAMES, frame_index,
                    detections, tracker.trajectories,
                )

                # q to close window
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

            frame_index += 1
    finally:
        video.release()
        cv2.destroyAllWindows()

    print_summary(stats, detected, tracker, frame_index)


def print_summary(stats, detected, tracker, total_frames):
    def pct(n):
        return f"{n} ({100 * n / max(total_frames, 1):.1f}%)"

    print(f"\nSegmentation summary ({total_frames} frames)")
    for robot_id, counts in stats.items():
        print(
            f"  robot {robot_id} ({ROBOT_NAMES[robot_id]}): "
            f"1 region {pct(counts['one'])} | "
            f"none {pct(counts['none'])} | "
            f"2+ regions {pct(counts['many'])}"
        )

    print(f"\nDetection summary ({total_frames} frames)")
    for robot_id, count in detected.items():
        print(
            f"  robot {robot_id} ({ROBOT_NAMES[robot_id]}): "
            f"detected {pct(count)} | missed {pct(total_frames - count)}"
        )

    print(f"\nTracking summary ({total_frames} frames)")
    for robot_id, points in tracker.trajectories.items():
        accepted = sum(1 for point in points if point.detected)
        print(
            f"  robot {robot_id} ({ROBOT_NAMES[robot_id]}): "
            f"{len(points)} points | accepted {pct(accepted)} | "
            f"rejected jumps {tracker.rejected[robot_id]}"
        )


if __name__ == "__main__":
    args = parse_args()
    cv_worker(args.video, display=not args.no_display)
