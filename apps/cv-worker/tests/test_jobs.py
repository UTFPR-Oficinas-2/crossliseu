"""One analysis job without RabbitMQ: what run_job reports for a given pipeline result.

Run from the repository root (OpenCV and boto3 are not needed, the pipeline and R2 are faked):
    python -m unittest discover -s apps/cv-worker/tests
"""
import json
import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class ObjectNotFound(Exception):
    pass


fake_pipeline = types.ModuleType("pipeline")
fake_pipeline.run_pipeline = None  # replaced per test
fake_storage = types.ModuleType("object_storage")
fake_storage.ObjectNotFound = ObjectNotFound

# Only while importing jobs: the other test modules install their own fakes
with mock.patch.dict(sys.modules, {"pipeline": fake_pipeline, "object_storage": fake_storage}):
    sys.modules.pop("jobs", None)
    import jobs  # noqa: E402  (after the fakes above)


BODY = json.dumps({"matchId": "m1", "videoKey": "recordings/m1.mp4"}).encode()


class FakeStorage:
    def __init__(self):
        self.uploaded = []

    def download(self, key, destination):
        return Path(destination)

    def upload_analysis(self, match_id, files):
        self.uploaded.extend(files)
        return {path.name: f"analysis/{match_id}/{path.name}" for path in files}


def pipeline_result(total_frames):
    """What run_pipeline returns for a video that yielded `total_frames` frames."""
    def run_pipeline(video, output_dir):
        has_frames = total_frames > 0
        return SimpleNamespace(
            total_frames=total_frames,
            trajectories_path=Path(output_dir) / "trajectories.csv",
            robots={
                robot_id: SimpleNamespace(
                    accepted_points=0,
                    heatmap_path=Path(output_dir) / f"heatmap_robot{robot_id}.png" if has_frames else None,
                )
                for robot_id in (1, 2)
            },
        )
    return run_pipeline


class RunJobTest(unittest.TestCase):
    def test_video_with_frames_is_done_with_a_heatmap_per_side(self):
        with mock.patch.object(jobs, "run_pipeline", pipeline_result(total_frames=120)):
            result = jobs.run_job(BODY, FakeStorage())
        self.assertEqual(result["status"], "done")
        self.assertEqual(result["robots"]["A"]["heatmapKey"], "analysis/m1/heatmap_robot1.png")
        self.assertEqual(result["robots"]["B"]["heatmapKey"], "analysis/m1/heatmap_robot2.png")

    def test_video_that_opens_but_yields_no_frames_is_unreadable(self):
        # A damaged stream behind a valid header: OpenCV opens it, then the first read fails
        storage = FakeStorage()
        with mock.patch.object(jobs, "run_pipeline", pipeline_result(total_frames=0)):
            with self.assertRaises(jobs.PermanentJobError) as caught:
                jobs.run_job(BODY, storage)
        self.assertEqual(caught.exception.code, "video_unreadable")
        self.assertEqual(storage.uploaded, [], "nothing goes to R2 for a video with no frames")


if __name__ == "__main__":
    unittest.main()
