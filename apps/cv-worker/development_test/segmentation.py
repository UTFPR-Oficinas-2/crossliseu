import cv2
import numpy as np


def create_mask(frame_hsv, ranges):
    #cria a mascara
    mask = np.zeros(frame_hsv.shape[:2], dtype=np.uint8)

    for lower, upper in ranges:
        lower = np.array(lower, dtype=np.uint8)
        upper = np.array(upper, dtype=np.uint8)
        # Pixel dentro da faixa -> 255 (branco); fora -> 0 (preto)
        partial = cv2.inRange(frame_hsv, lower, upper)
        mask = cv2.bitwise_or(mask, partial)

    return mask


def clean_mask(mask, kernel_size=5):
    if kernel_size <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return mask


def segment_color(frame_hsv, ranges, kernel_size=5):
    mask = create_mask(frame_hsv, ranges)
    return clean_mask(mask, kernel_size)


def segment_all(frame_hsv, colors, kernel_size=5):
    return {
        name: segment_color(frame_hsv, ranges, kernel_size)
        for name, ranges in colors.items()
    }
