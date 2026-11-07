from pathlib import Path

# Paths (built from this file, so the worker runs from any folder)
CV_WORKER_DIR = Path(__file__).resolve().parent.parent
VIDEOS_DIR = CV_WORKER_DIR / "data" / "videos"
OUTPUT_DIR = CV_WORKER_DIR / "data" / "output"
DEFAULT_VIDEO = VIDEOS_DIR / "test_two_robots_red_blue_compatible.mp4"

# Robots
# robot_id -> name used in logs and windows
ROBOT_NAMES = {
    1: "blue",
    2: "red",
}

# HSV ranges per robot: a list of (lower, upper) pairs.
# OpenCV HSV: H 0-179, S 0-255, V 0-255.
# Red needs two ranges because its hue wraps around (both ends of H).
# Find the values with: python tools/hsv_calibrator.py --robot <id>
ROBOT_COLORS = {
    1: [((100, 120, 50), (130, 255, 255))],
    2: [((170, 120, 70), (179, 255, 255)), ((0, 120, 70), (10, 255, 255))],
}

# Processing
BLUR_KERNEL = 5   # GaussianBlur, made odd if needed; 0 disables it
MORPH_KERNEL = 5  # opening + closing of the masks; 0 disables it

# Detection
MIN_CONTOUR_AREA = 500  # px; smaller regions are noise. Synthetic marker is ~85x85 = ~7200 px

# Tracking
# A detection farther than this * frames since last seen is an impossible jump.
# Synthetic video: robots move at most ~7 px/frame.
MAX_SPEED_PX_PER_FRAME = 7

# Heatmap
HEATMAP_TITLE = "Crossliseu"
HEATMAP_CELL_PX = 20         # grid cell size in pixels (1280x720 -> 64x36 cells)
HEATMAP_BLUR_CELLS = 1.5     # Gaussian smoothing, in cells; 0 disables it
# One hue per robot, light -> dark (matplotlib colormap names)
HEATMAP_COLORMAPS = {
    1: "Blues",
    2: "Reds",
}
