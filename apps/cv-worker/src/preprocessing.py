import cv2


def reduce_noise(frame_bgr, kernel_size=5):
    if kernel_size <= 0:
        return frame_bgr

    # GaussianBlur requires an odd kernel size
    if kernel_size % 2 == 0:
        kernel_size += 1
        # #  #  # #
        # #  #  # #
        # # [#] # # ---- > Builded rounded by a central point
        # #  #  # #
        # #  #  # #
        
    return cv2.GaussianBlur(
        frame_bgr,
        (kernel_size, kernel_size),
        0
    )


def convert_to_hsv(frame):
    hsv_frame = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2HSV
    )

    return hsv_frame


def preprocess(frame, blur_kernel=5):
    # Receive BGR frame from OpenCV

    # Reduce image noise
    frame = reduce_noise(
        frame,
        blur_kernel
    )

    # Convert BGR -> HSV
    frame_hsv = convert_to_hsv(frame)

    # H → Hue        → which color
    # S → Saturation → color intensity
    # V → Value      → luminosity

    return frame_hsv


def show_hsv_value(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        hsv_frame = param

        pixel = hsv_frame[y, x]

        print(f"x={x}, y={y}, HSV={pixel}")