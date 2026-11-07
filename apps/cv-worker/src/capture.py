from pathlib import Path
import cv2


class VideoCapture():

    def __init__(self, video_source: Path):
        self.video_source = video_source
        self.capture = cv2.VideoCapture(str(video_source))

        if not self.capture.isOpened():
            raise RuntimeError(f"Couldn't open the video: {video_source}")

        # Frames per second, used for timestamp = frame_index / fps.
        # Some files report 0; fall back to 30 so the division never breaks.
        self.fps = self.capture.get(cv2.CAP_PROP_FPS) or 30.0

        # Frame size in pixels, used to validate that positions are inside the image
        self.width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT))

    def read_frame(self):
        ret, frame = self.capture.read()
        #print(frame.shape)
        #numpy.ndarray
        #(1080, 1920, 3) height, width, chanels(BGR)

        if not ret:
            return None

        return frame

    def release(self):
        self.capture.release()