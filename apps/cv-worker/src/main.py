from capture import VideoCapture
from preprocessing import preprocess, show_hsv_value
from segmentation import create_mask
import cv2


def cv_worker():
    video = VideoCapture("test/test_video_capture.mp4")

    while True:
        frame = video.read_frame()

        if frame is None:
            break

        # Pre-processing
        frame_hsv = preprocess(frame)

        # HSV range
        lower_blue = (100, 120, 50)
        upper_blue = (130, 255, 255)

        # Segmentation
        mask = create_mask(
            frame_hsv,
            lower_blue,
            upper_blue
        )

        cv2.imshow("ORIGINAL", frame)
        cv2.imshow("MASK", mask)

        cv2.setMouseCallback(
            "ORIGINAL",
            show_hsv_value,
            frame_hsv
        )

        # Bitmask to close Window (q to close window)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    video.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    cv_worker()