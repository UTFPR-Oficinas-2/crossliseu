"""Tracking: detections of each frame -> one trajectory point per robot per frame."""
import math
from dataclasses import dataclass


@dataclass
class TrajectoryPoint:
    robot_id: int
    frame: int
    timestamp_s: float
    detected: bool        # False = robot missed (or rejected) in this frame
    x: int | None = None  # None when not detected
    y: int | None = None
    area: float | None = None


class Tracker:
    def __init__(self, robot_ids, max_speed_px_per_frame):
        self.max_speed = max_speed_px_per_frame

        # Last accepted position of each robot: {robot_id: (x, y, frame)}
        self.last_seen = {robot_id: None for robot_id in robot_ids}

        # Full history: {robot_id: [TrajectoryPoint, ...]}
        self.trajectories = {robot_id: [] for robot_id in robot_ids}

        # How many detections were thrown away as impossible jumps
        self.rejected = {robot_id: 0 for robot_id in robot_ids}

    def update(self, frame_index, timestamp_s, detections):
        """Record one frame. detections = {robot_id: Detection or None}."""
        points = {}

        for robot_id in self.trajectories:
            detection = detections.get(robot_id)

            if detection is not None and self._is_impossible_jump(robot_id, detection, frame_index):
                self.rejected[robot_id] += 1
                detection = None  # treat it as a miss

            if detection is None:
                point = TrajectoryPoint(robot_id, frame_index, timestamp_s, detected=False)
            else:
                point = TrajectoryPoint(
                    robot_id, frame_index, timestamp_s, detected=True,
                    x=detection.x, y=detection.y, area=detection.area,
                )
                self.last_seen[robot_id] = (detection.x, detection.y, frame_index)

            self.trajectories[robot_id].append(point)
            points[robot_id] = point

        return points

    def _is_impossible_jump(self, robot_id, detection, frame_index):
        last = self.last_seen[robot_id]
        if last is None:  # first time we see this robot: nothing to compare
            return False

        last_x, last_y, last_frame = last
        frames_since = frame_index - last_frame

        # Speed limit: the longer the robot was not seen, the farther it may be
        allowed = self.max_speed * frames_since
        distance = math.dist((detection.x, detection.y), (last_x, last_y))

        return distance > allowed
