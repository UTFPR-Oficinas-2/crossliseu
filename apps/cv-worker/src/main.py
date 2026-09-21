from capture import VideoCapture
import cv2


def cv_worker():
    video = VideoCapture("test/test_video_capture.mp4")
    while True:
        frame = video.read_frame()

        if frame is None:
            break

        cv2.imshow("CV_WORKER", frame)

        #Bitmask to close Window (q to close window)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    video.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    cv_worker()