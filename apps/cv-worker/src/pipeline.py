"""The whole pipeline as one function: video file -> trajectories.csv + heatmaps.

main.py (local tests) calls it today; worker.py (the container) will call it
the same way. It prints nothing: everything it found comes back in the result.
"""
from dataclasses import dataclass
from pathlib import Path

import cv2

from capture import VideoCapture
from config import (
    BLUR_KERNEL, HEATMAP_BLUR_CELLS, HEATMAP_CELL_PX, HEATMAP_COLORMAPS, HEATMAP_TITLE,
    MAX_SPEED_PX_PER_FRAME, MIN_CONTOUR_AREA, MORPH_KERNEL, ROBOT_COLORS, ROBOT_NAMES,
)
from detection import detect_robots
from heatmap import generate_heatmaps
from preprocessing import preprocess
from segmentation import count_regions, segment_all
from storage import save_trajectories
from tracking import Tracker


@dataclass
class RobotResult:
    robot_id: int
    mask_regions: dict          # frames with {"none", "one", "many"} regions in the mask
    detected_frames: int        # frames where detection found the robot
    accepted_points: int        # frames kept by tracking (= detectedPositions for the API)
    rejected_jumps: int         # detections thrown away as impossible jumps
    heatmap_path: Path | None   # None when the video had no frames


@dataclass
class PipelineResult:
    video_path: Path
    total_frames: int
    fps: float
    width: int
    height: int
    stopped_early: bool         # True when the debug window was closed with q
    trajectories_path: Path
    rows: int                   # rows written to trajectories.csv
    robots: dict                # {robot_id: RobotResult}


def run_pipeline(video_path, output_dir, display=False):
    """Process one video and write trajectories.csv + heatmap_robot<id>.png in output_dir."""
    video_path = Path(video_path)
    output_dir = Path(output_dir)
    video = VideoCapture(video_path)

    # Mask validation: per robot, how many frames had 0, 1 or 2+ regions.
    # A good segmentation has exactly 1 region in (almost) every frame.
    stats = {robot_id: {"none": 0, "one": 0, "many": 0} for robot_id in ROBOT_COLORS}
    # Detection: per robot, in how many frames it was found
    detected = {robot_id: 0 for robot_id in ROBOT_COLORS}
    # Tracking: one TrajectoryPoint per robot per frame
    tracker = Tracker(ROBOT_COLORS, MAX_SPEED_PX_PER_FRAME)
    # Heatmap background: the first frame (later: a photo of the empty arena)
    background = None
    frame_index = 0
    stopped_early = False

    try:
        while True:
            frame = video.read_frame()

            if frame is None:
                break

            if background is None:
                background = frame.copy()

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
                # Imported here so the container (OpenCV without windows) never loads it
                from debug import show_masks
                show_masks(
                    frame, masks, regions, ROBOT_NAMES, frame_index,
                    detections, tracker.trajectories,
                )

                # q to close window
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    stopped_early = True
                    break

            frame_index += 1
    finally:
        video.release()
        if display:
            cv2.destroyAllWindows()

    # Storage: output_dir/trajectories.csv
    # Also runs when the run was stopped with q: it saves the frames processed so far.
    trajectories_path = output_dir / "trajectories.csv"
    rows = save_trajectories(
        tracker.trajectories, trajectories_path, ROBOT_COLORS, video.width, video.height,
    )

    # Heatmap: one PNG per robot, next to the CSV (needs at least one frame)
    heatmap_paths = {}
    if background is not None:
        paths = generate_heatmaps(
            trajectories_path, background, output_dir, ROBOT_NAMES, HEATMAP_COLORMAPS,
            HEATMAP_TITLE, HEATMAP_CELL_PX, HEATMAP_BLUR_CELLS,
        )
        # generate_heatmaps names each file heatmap_robot<id>.png
        heatmap_paths = {int(path.stem.removeprefix("heatmap_robot")): path for path in paths}

    robots = {
        robot_id: RobotResult(
            robot_id=robot_id,
            mask_regions=stats[robot_id],
            detected_frames=detected[robot_id],
            accepted_points=sum(1 for point in points if point.detected),
            rejected_jumps=tracker.rejected[robot_id],
            heatmap_path=heatmap_paths.get(robot_id),
        )
        for robot_id, points in tracker.trajectories.items()
    }

    return PipelineResult(
        video_path=video_path,
        total_frames=frame_index,
        fps=video.fps,
        width=video.width,
        height=video.height,
        stopped_early=stopped_early,
        trajectories_path=trajectories_path,
        rows=rows,
        robots=robots,
    )
