import cv2


def convert_to_hsv(frame):
    hsv_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    return hsv_frame


def preprocess(frame):
    # Receive frame BGR from OpenCV

    # Converts BGR -> HSV
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