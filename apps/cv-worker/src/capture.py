from pathlib import Path
import cv2


class VideoCapture():

    def __init__(self,video_source:Path):
        self.video_source = video_source
        self.capture = cv2.VideoCapture(str(video_source))

        if not self.capture.isOpened():
            raise RuntimeError(f"Couldn't open the video: {video_source}")

    def read_frame(self):
        ret, frame = self.capture.read()

        if not ret:
            return None

        return frame

    def release(self):
        self.capture.release()

    