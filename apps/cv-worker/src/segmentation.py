"""Segmentation starts with create mask function, a pipeline will be develop for this module"""
import cv2
import numpy as np


def create_mask(frame_hsv, lower, upper):
    lower = np.array(lower, dtype=np.uint8)
    upper = np.array(upper, dtype=np.uint8)

    mask = cv2.inRange(frame_hsv, lower, upper)

    return mask

#Concepts of Closing and Opening of the mask, for cleaning

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