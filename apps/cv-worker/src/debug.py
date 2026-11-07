"""Debug drawings. Only main.py (with display on) and tools/ use this module;
the pipeline modules never open windows."""
import cv2
import numpy as np

FONT = cv2.FONT_HERSHEY_SIMPLEX
TEXT_COLOR = (0, 255, 255)  # yellow (BGR)
MAX_VIEW_WIDTH = 1280


def tile_scale(frame):
    """Scale so that two tiles side by side fit in MAX_VIEW_WIDTH."""
    return min(1.0, MAX_VIEW_WIDTH / 2 / frame.shape[1])


def to_tile(image, scale, text):
    if image.ndim == 2:  # masks are 1 channel; the grid needs 3
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    tile = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    cv2.putText(tile, text, (10, 25), FONT, 0.6, (0, 0, 0), 4)
    cv2.putText(tile, text, (10, 25), FONT, 0.6, TEXT_COLOR, 1)
    return tile


def grid(top_left, top_right, bottom_left, bottom_right):
    return np.vstack([
        np.hstack([top_left, top_right]),
        np.hstack([bottom_left, bottom_right]),
    ])


def draw_detections(frame, detections):
    """Copy of the frame with bounding box, centroid and label of each robot."""
    drawn = frame.copy()

    for robot_id, detection in detections.items():
        if detection is None:  # robot not found in this frame
            continue

        x, y, w, h = detection.bbox
        cv2.rectangle(drawn, (x, y), (x + w, y + h), TEXT_COLOR, 2)
        cv2.circle(drawn, (detection.x, detection.y), 6, (0, 0, 0), -1)
        cv2.circle(drawn, (detection.x, detection.y), 4, TEXT_COLOR, -1)

        label = f"R{robot_id} ({detection.x}, {detection.y})"
        cv2.putText(drawn, label, (x, y - 10), FONT, 0.7, (0, 0, 0), 4)
        cv2.putText(drawn, label, (x, y - 10), FONT, 0.7, TEXT_COLOR, 2)

    return drawn


TRAIL_COLORS = {1: (0, 255, 0), 2: (255, 0, 255)}  # robot 1 green, robot 2 magenta
TRAIL_LENGTH = 90  # frames of history drawn (3 s at 30 fps)


def draw_trails(drawn, trajectories):
    """Line through the last TRAIL_LENGTH positions of each robot (in place).

    The line is broken where the robot was missed, so gaps stay visible.
    """
    for robot_id, points in trajectories.items():
        color = TRAIL_COLORS.get(robot_id, TEXT_COLOR)
        recent = points[-TRAIL_LENGTH:]

        for previous, current in zip(recent, recent[1:]):
            if previous.detected and current.detected:
                cv2.line(drawn, (previous.x, previous.y), (current.x, current.y), color, 2)

    return drawn


def show_masks(frame, masks, regions, robot_names, frame_index, detections, trajectories):
    """2x2 window: detections + trails | overlay / robot 1 mask | robot 2 mask."""
    scale = tile_scale(frame)
    (id_1, mask_1), (id_2, mask_2) = masks.items()

    overlay = frame.copy()
    overlay[mask_1 > 0] = (0, 255, 0)    # robot 1 painted green
    overlay[mask_2 > 0] = (255, 0, 255)  # robot 2 painted magenta

    view = grid(
        to_tile(
            draw_trails(draw_detections(frame, detections), trajectories),
            scale, f"detections + trails  frame {frame_index}",
        ),
        to_tile(overlay, scale, f"overlay  green={robot_names[id_1]} magenta={robot_names[id_2]}"),
        to_tile(mask_1, scale, f"robot {id_1} ({robot_names[id_1]})  regions: {regions[id_1]}"),
        to_tile(mask_2, scale, f"robot {id_2} ({robot_names[id_2]})  regions: {regions[id_2]}"),
    )
    cv2.imshow("cv-worker: masks", view)
