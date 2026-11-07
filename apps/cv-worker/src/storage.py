"""Storage: validate trajectories and write / read trajectories.csv.

The CSV format is the contract described in docs/cv-worker-pipeline.md.
"""
import csv
from pathlib import Path

from tracking import TrajectoryPoint

CSV_COLUMNS = [
    "frame", "timestamp_s", "robot_id", "detected",
    "x_px", "y_px", "x_arena", "y_arena", "area",
]


def validate_trajectories(trajectories, robot_ids, frame_width, frame_height):
    """Return a list of problems; an empty list means the data is valid."""
    errors = []

    for robot_id, points in trajectories.items():
        if robot_id not in robot_ids:
            errors.append(f"robot {robot_id}: not a configured robot")

        previous = None
        for point in points:
            where = f"robot {robot_id}, frame {point.frame}"

            if point.robot_id != robot_id:
                errors.append(f"{where}: point has robot_id {point.robot_id}")

            # Frames go up by one and time never goes back
            if previous is not None:
                if point.frame != previous.frame + 1:
                    errors.append(f"{where}: expected frame {previous.frame + 1}")
                if point.timestamp_s < previous.timestamp_s:
                    errors.append(f"{where}: timestamp went back")

            if point.detected:
                # A detected position must be inside the image
                if point.x is None or point.y is None:
                    errors.append(f"{where}: detected but has no position")
                elif not (0 <= point.x < frame_width and 0 <= point.y < frame_height):
                    errors.append(f"{where}: position ({point.x}, {point.y}) outside the frame")
            elif (point.x, point.y, point.area) != (None, None, None):
                # A miss must not carry a position
                errors.append(f"{where}: missed but has a position")

            previous = point

    return errors


def save_trajectories(trajectories, path, robot_ids, frame_width, frame_height):
    """Validate, then write one row per robot per frame. Returns the number of rows."""
    errors = validate_trajectories(trajectories, robot_ids, frame_width, frame_height)
    if errors:
        shown = "\n  ".join(errors[:20])
        raise ValueError(f"{len(errors)} invalid trajectory point(s), nothing written:\n  {shown}")

    # Order by frame, then robot: frame 0 robot 1, frame 0 robot 2, frame 1 robot 1...
    rows = sorted(
        (point for points in trajectories.values() for point in points),
        key=lambda point: (point.frame, point.robot_id),
    )

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(CSV_COLUMNS)
        for point in rows:
            writer.writerow([
                point.frame,
                f"{point.timestamp_s:.3f}",
                point.robot_id,
                int(point.detected),
                _empty_if_none(point.x),
                _empty_if_none(point.y),
                "",  # x_arena: filled once arena mapping exists
                "",  # y_arena
                _empty_if_none(None if point.area is None else round(point.area)),
            ])

    return len(rows)


def load_trajectories(path):
    """Read trajectories.csv back into {robot_id: [TrajectoryPoint, ...]}."""
    trajectories = {}

    with Path(path).open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            point = TrajectoryPoint(
                robot_id=int(row["robot_id"]),
                frame=int(row["frame"]),
                timestamp_s=float(row["timestamp_s"]),
                detected=row["detected"] == "1",
                x=_int_or_none(row["x_px"]),
                y=_int_or_none(row["y_px"]),
                area=_int_or_none(row["area"]),
            )
            trajectories.setdefault(point.robot_id, []).append(point)

    return trajectories


def _empty_if_none(value):
    return "" if value is None else value


def _int_or_none(text):
    return None if text == "" else int(text)
