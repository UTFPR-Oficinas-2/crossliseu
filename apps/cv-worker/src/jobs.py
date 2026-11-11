"""One analysis job, without RabbitMQ: request message in, result message out.

Request  (queue analysis.requested): {"matchId": "...", "videoKey": "recordings/<id>.mp4"}
Result   (queue analysis.finished):
    {"matchId", "status": "done", "mock": bool, "totalFrames", "trajectoriesKey",
     "robots": {"A": {"detectedPositions", "totalFrames", "heatmapKey"}, "B": {...}}}
    {"matchId", "status": "failed", "error": "<code>", "detail": "<text>"}

Robot 1 (blue marker) is side A of the match, robot 2 (red) is side B.
"""
import json
import tempfile
from pathlib import Path

from object_storage import ObjectNotFound
from pipeline import run_pipeline

ROBOT_SIDES = {1: "A", 2: "B"}


class PermanentJobError(Exception):
    """The job can never succeed (bad message, missing video): report failed, do not retry."""

    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code


def parse_request(body):
    try:
        message = json.loads(body)
        match_id, video_key = message["matchId"], message["videoKey"]
    except (ValueError, TypeError, KeyError) as error:
        raise PermanentJobError("invalid_message", f"bad request message: {error}") from error
    if not isinstance(match_id, str) or not isinstance(video_key, str) or not match_id or not video_key:
        raise PermanentJobError("invalid_message", "matchId and videoKey must be non-empty strings")
    return match_id, video_key


def run_job(body, storage, mock_video=None):
    """Download, process and upload one job. Returns the result message (a dict).

    With `mock_video` set, the recording is still downloaded (so the R2 path is exercised) but
    the pipeline runs on that fixed file instead: test recordings have no robot markers.
    Raises PermanentJobError for jobs that can never succeed; any other exception is transient.
    """
    match_id, video_key = parse_request(body)

    with tempfile.TemporaryDirectory(prefix="cv-job-") as tmp:
        tmp = Path(tmp)
        try:
            recording = storage.download(video_key, tmp / "input")
        except ObjectNotFound as error:
            raise PermanentJobError("recording_not_found", str(error)) from error

        video = Path(mock_video) if mock_video else recording
        try:
            result = run_pipeline(video, tmp / "output")
        except RuntimeError as error:  # VideoCapture: the file is not a readable video
            raise PermanentJobError("video_unreadable", str(error)) from error

        files = [result.trajectories_path] + [
            robot.heatmap_path for robot in result.robots.values() if robot.heatmap_path
        ]
        keys = storage.upload_analysis(match_id, files)

    return {
        "matchId": match_id,
        "status": "done",
        "mock": bool(mock_video),
        "totalFrames": result.total_frames,
        "trajectoriesKey": keys[result.trajectories_path.name],
        "robots": {
            ROBOT_SIDES.get(robot_id, str(robot_id)): {
                "detectedPositions": robot.accepted_points,
                "totalFrames": result.total_frames,
                "heatmapKey": keys.get(robot.heatmap_path.name) if robot.heatmap_path else None,
            }
            for robot_id, robot in result.robots.items()
        },
    }


def failed_message(body, code, detail):
    """Result message for a job that failed; matchId may be unknown for a bad message."""
    try:
        match_id = json.loads(body).get("matchId")
    except (ValueError, AttributeError):
        match_id = None
    return {"matchId": match_id, "status": "failed", "error": code, "detail": detail[:500]}
