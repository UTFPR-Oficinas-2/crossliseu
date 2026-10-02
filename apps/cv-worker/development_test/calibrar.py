import cv2
import numpy as np

from config import VIDEO_PATH, BLUR_KERNEL, MORPH_KERNEL
from preprocessing import preprocess
from segmentation import segment_color

WINDOW = "Controles"


def nothing(_):
    pass


def create_trackbars():
    cv2.namedWindow(WINDOW)
    cv2.createTrackbar("H min", WINDOW, 0, 179, nothing)
    cv2.createTrackbar("H max", WINDOW, 179, 179, nothing)
    cv2.createTrackbar("S min", WINDOW, 0, 255, nothing)
    cv2.createTrackbar("S max", WINDOW, 255, 255, nothing)
    cv2.createTrackbar("V min", WINDOW, 0, 255, nothing)
    cv2.createTrackbar("V max", WINDOW, 255, 255, nothing)


def read_trackbars():
    lower = (
        cv2.getTrackbarPos("H min", WINDOW),
        cv2.getTrackbarPos("S min", WINDOW),
        cv2.getTrackbarPos("V min", WINDOW),
    )
    upper = (
        cv2.getTrackbarPos("H max", WINDOW),
        cv2.getTrackbarPos("S max", WINDOW),
        cv2.getTrackbarPos("V max", WINDOW),
    )
    return lower, upper


def main():
    cap = cv2.VideoCapture(VIDEO_PATH)
    if not cap.isOpened():
        print(f"N consegui abrir o video: {VIDEO_PATH}")
        return

    create_trackbars()
    paused = False
    frame = None

    while True:
        if not paused or frame is None:
            ret, frame = cap.read()
            if not ret:
                # Volta para o comeco quando o video acaba
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

        hsv = preprocess(frame, BLUR_KERNEL)
        lower, upper = read_trackbars()
        mask = segment_color(hsv, [(lower, upper)], MORPH_KERNEL)
        result = cv2.bitwise_and(frame, frame, mask=mask)

        cv2.imshow("Original", frame)
        cv2.imshow("Mascara", mask)
        cv2.imshow("Resultado", result)

        key = cv2.waitKey(30) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" "):
            paused = not paused
        if key == ord("p"):
            print(f"(({lower[0]}, {lower[1]}, {lower[2]}), "
                  f"({upper[0]}, {upper[1]}, {upper[2]})),")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
