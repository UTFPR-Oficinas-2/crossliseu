from capture import VideoCapture
from preprocessing import preprocess, show_hsv_value
from segmentation import create_mask,clean_mask
from config import LOWER_BLUE, UPPER_BLUE, LOWER_RED, UPPER_RED
import cv2


def cv_worker():
    video = VideoCapture("../test/test_two_robots_red_blue_compatible.mp4")

    while True:
        frame = video.read_frame()

        if frame is None:
            break

        # Pre-processing
        frame_hsv = preprocess(frame)

        # Segmentation
        blue_mask = create_mask(
            frame_hsv,
            LOWER_BLUE,
            UPPER_BLUE
        )

        red_mask = create_mask(
            frame_hsv,
            LOWER_RED,
            UPPER_RED
        )

        blue_mask_c = clean_mask(blue_mask)
        red_mask_c = clean_mask(red_mask)

        # Display // Just for tests
        cv2.imshow("BLUE MASK", blue_mask_c)
        cv2.imshow("RED MASK", red_mask_c)

        # cv2.setMouseCallback(
        #     "ORIGINAL",
        #     show_hsv_value,
        #     frame_hsv
        # )

        # q to close window
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    video.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    cv_worker()