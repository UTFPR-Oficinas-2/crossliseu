from capture import VideoCapture
from preprocessing import preprocess,show_hsv_value
import cv2


def cv_worker():
    video = VideoCapture("test/test_video_capture.mp4")
    while True:
        frame = video.read_frame()

        if frame is None:
            break

        frame_hsv = preprocess(frame)

        #cv2.imshow("ORIGINAL", frame)
        cv2.imshow("HSV",frame_hsv)

        cv2.setMouseCallback("HSV", show_hsv_value, frame_hsv)

        #Bitmask to close Window (q to close window)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    video.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    cv_worker()