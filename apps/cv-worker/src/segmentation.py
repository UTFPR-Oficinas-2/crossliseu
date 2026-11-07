"""Segmentation: HSV frame -> one clean binary mask per robot."""
import cv2
import numpy as np


def create_mask(frame_hsv, ranges):
    """White where the pixel falls inside ANY of the (lower, upper) ranges."""
    mask = np.zeros(frame_hsv.shape[:2], dtype=np.uint8)

    for lower, upper in ranges:
        range_mask = cv2.inRange(
            frame_hsv,
            np.array(lower, dtype=np.uint8),
            np.array(upper, dtype=np.uint8),
        )
        mask = cv2.bitwise_or(mask, range_mask)

    return mask


# Concepts of Closing and Opening of the mask, for cleaning
#   opening = erode then dilate -> removes small white specks
#   closing = dilate then erode -> fills small black holes inside the marker
def clean_mask(mask, kernel_size=5):
    if kernel_size <= 0:
        return mask

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size)
    )

    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    return mask


def segment_color(frame_hsv, ranges, kernel_size=5):
    mask = create_mask(frame_hsv, ranges)
    return clean_mask(mask, kernel_size)


def segment_all(frame_hsv, robot_colors, kernel_size=5):
    """{robot_id: ranges} -> {robot_id: clean mask}"""
    return {
        robot_id: segment_color(frame_hsv, ranges, kernel_size)
        for robot_id, ranges in robot_colors.items()
    }


def count_regions(mask):
    """Number of separate white regions, ignoring regions inside holes of others.

    Used to validate a mask: a good mask has exactly 1 region per robot.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return len(contours)
