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


def show_masks(frame, masks, regions, robot_names, frame_index):
    """2x2 window: original | overlay / robot 1 mask | robot 2 mask."""
    scale = tile_scale(frame)
    (id_1, mask_1), (id_2, mask_2) = masks.items()

    overlay = frame.copy()
    overlay[mask_1 > 0] = (0, 255, 0)    # robot 1 painted green
    overlay[mask_2 > 0] = (255, 0, 255)  # robot 2 painted magenta

    view = grid(
        to_tile(frame, scale, f"original  frame {frame_index}"),
        to_tile(overlay, scale, f"overlay  green={robot_names[id_1]} magenta={robot_names[id_2]}"),
        to_tile(mask_1, scale, f"robot {id_1} ({robot_names[id_1]})  regions: {regions[id_1]}"),
        to_tile(mask_2, scale, f"robot {id_2} ({robot_names[id_2]})  regions: {regions[id_2]}"),
    )
    cv2.imshow("cv-worker: masks", view)
