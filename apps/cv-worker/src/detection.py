"""Detection: clean mask -> robot candidates -> one position per robot."""
from dataclasses import dataclass

import cv2


@dataclass
class Detection:
    x: int          # centroid, in pixels
    y: int
    area: float     # contour area, in pixels
    bbox: tuple     # bounding box (x, y, width, height), for debugging


def find_candidates(mask, min_area):
    """Every white region of the mask that is big enough to be a robot."""
    # RETR_EXTERNAL: only the outermost contours. Holes inside a region
    # (like the letter on the synthetic marker) do not become contours.
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for contour in contours:
        # Moments of the contour:
        #   m00 = area
        #   m10 / m00 = x of the centroid
        #   m01 / m00 = y of the centroid
        moments = cv2.moments(contour)
        area = moments["m00"]

        # Too small: leftover noise or a reflection, not a robot
        if area == 0 or area < min_area:
            continue

        candidates.append(Detection(
            x=round(moments["m10"] / area),
            y=round(moments["m01"] / area),
            area=area,
            bbox=cv2.boundingRect(contour),
        ))

    return candidates


def select_robot(candidates):
    """The robot is the biggest candidate; None if there is no candidate."""
    return max(candidates, key=lambda candidate: candidate.area, default=None)


def detect_robots(masks, min_area):
    """{robot_id: mask} -> {robot_id: Detection or None}

    Identification comes from the mask itself: the blue mask can only
    give robot 1 and the red mask can only give robot 2.
    """
    return {
        robot_id: select_robot(find_candidates(mask, min_area))
        for robot_id, mask in masks.items()
    }
