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
            combined_heatmap_path=Path(output_dir) / "heatmap_combined.png" if has_frames else None,
        )
    return run_pipeline


class RunJobTest(unittest.TestCase):
    def test_video_with_frames_is_done_with_a_heatmap_per_side(self):
        with mock.patch.object(jobs, "run_pipeline", pipeline_result(total_frames=120)):
            result = jobs.run_job(BODY, FakeStorage())
        self.assertEqual(result["status"], "done")
        self.assertEqual(result["robots"]["A"]["heatmapKey"], "analysis/m1/heatmap_robot1.png")
        self.assertEqual(result["robots"]["B"]["heatmapKey"], "analysis/m1/heatmap_robot2.png")

    def test_combined_heatmap_is_uploaded_and_reported(self):
        storage = FakeStorage()
        with mock.patch.object(jobs, "run_pipeline", pipeline_result(total_frames=120)):
            result = jobs.run_job(BODY, storage)
        self.assertEqual(result["combinedHeatmapKey"], "analysis/m1/heatmap_combined.png")
        self.assertIn("heatmap_combined.png", [path.name for path in storage.uploaded])

    def test_video_that_opens_but_yields_no_frames_is_unreadable(self):
        # A damaged stream behind a valid header: OpenCV opens it, then the first read fails
        storage = FakeStorage()
        with mock.patch.object(jobs, "run_pipeline", pipeline_result(total_frames=0)):
            with self.assertRaises(jobs.PermanentJobError) as caught:
                jobs.run_job(BODY, storage)
        self.assertEqual(caught.exception.code, "video_unreadable")
        self.assertEqual(storage.uploaded, [], "nothing goes to R2 for a video with no frames")

    def test_with_a_workdir_the_job_works_there_and_leaves_it_to_the_caller(self):
        # The worker's parent process owns the directory, so a killed job's files can be removed
        import tempfile

        seen = []

        def run_pipeline(video, output_dir):
            seen.append(Path(output_dir))
            return pipeline_result(total_frames=120)(video, output_dir)

        with tempfile.TemporaryDirectory() as workdir:
            with mock.patch.object(jobs, "run_pipeline", run_pipeline):
                jobs.run_job(BODY, FakeStorage(), workdir=workdir)
            self.assertEqual(seen[0].parent, Path(workdir))
            self.assertTrue(os.path.isdir(workdir))


if __name__ == "__main__":
    unittest.main()
