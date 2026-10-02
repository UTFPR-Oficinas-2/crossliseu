import cv2


def reduce_noise(frame_bgr, kernel_size=5):
    if kernel_size <= 0:
        return frame_bgr

    # O GaussianBlur exige kernel impar, porque precisa de um pixel central
    if kernel_size % 2 == 0:
        kernel_size += 1

    return cv2.GaussianBlur(frame_bgr, (kernel_size, kernel_size), 0)


def to_hsv(frame_bgr):
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)


def preprocess(frame_bgr, blur_kernel=5):
    frame = reduce_noise(frame_bgr, blur_kernel)
    return to_hsv(frame)
