"""Combined heatmap: renders, degrades gracefully, and never costs the per-robot maps.

Run from the repository root (needs OpenCV, NumPy and matplotlib):
    python -m unittest discover -s apps/cv-worker/tests
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import heatmap  # noqa: E402
from storage import save_trajectories  # noqa: E402
from tracking import TrajectoryPoint  # noqa: E402

WIDTH, HEIGHT = 200, 120
NAMES = {1: "Blue", 2: "Red"}
COLORMAPS = {1: "Blues", 2: "Reds"}


def trajectory(robot_id, detected=True, frames=30):
    return [
        TrajectoryPoint(
            robot_id, frame, frame / 30, detected=detected,
            x=50 + robot_id * 40 if detected else None, y=60 if detected else None, area=100 if detected else None,
        )
        for frame in range(frames)
    ]


def generate(output_dir, robot_ids, detected=True):
    csv_path = Path(output_dir) / "trajectories.csv"
    save_trajectories(
        {rid: trajectory(rid, detected) for rid in robot_ids}, csv_path, robot_ids, WIDTH, HEIGHT,
    )
    background = np.full((HEIGHT, WIDTH, 3), 128, dtype=np.uint8)
    return heatmap.generate_heatmaps(
        csv_path, background, output_dir, NAMES, COLORMAPS, "Title", cell_px=10, blur_cells=1,
    )


class CombinedHeatmapTest(unittest.TestCase):
    def assert_png(self, path):
        self.assertIsNotNone(path)
        self.assertTrue(Path(path).is_file() and Path(path).stat().st_size > 0)

    def test_both_robots_give_per_robot_maps_and_a_combined_one(self):
        with tempfile.TemporaryDirectory() as out:
            paths, combined = generate(out, (1, 2))
            self.assertEqual([p.name for p in paths], ["heatmap_robot1.png", "heatmap_robot2.png"])
            self.assertEqual(combined.name, "heatmap_combined.png")
            for path in (*paths, combined):
                self.assert_png(path)

    def test_one_robot_missing_still_draws_the_combined_map(self):
        with tempfile.TemporaryDirectory() as out:
            paths, combined = generate(out, (1,))
            self.assertEqual(len(paths), 1)
            self.assert_png(combined)

    def test_robot_never_detected_does_not_break_the_combined_map(self):
        # An all-zero grid: vmax must not divide by zero
        with tempfile.TemporaryDirectory() as out:
            _, combined = generate(out, (1, 2), detected=False)
            self.assert_png(combined)

    def test_combined_failure_keeps_the_per_robot_maps(self):
        with tempfile.TemporaryDirectory() as out:
            with mock.patch.object(heatmap, "render_combined_heatmap", side_effect=ValueError("x")):
                paths, combined = generate(out, (1, 2))
            self.assertIsNone(combined)
            self.assertEqual(len(paths), 2)
            for path in paths:
                self.assert_png(path)


if __name__ == "__main__":
    unittest.main()
