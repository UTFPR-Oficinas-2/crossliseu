"""Segmentation starts with create mask function, a pipeline will be develop for this module"""
import cv2
import numpy as np


def create_mask(frame_hsv, lower, upper):
    lower = np.array(lower, dtype=np.uint8)
    upper = np.array(upper, dtype=np.uint8)

    mask = cv2.inRange(frame_hsv, lower, upper)

    return mask