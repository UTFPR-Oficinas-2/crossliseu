"""Heatmap: trajectories.csv -> one PNG per robot.

Only reads the CSV (and one background image); it never touches the video
pipeline, so heatmaps can be regenerated from a saved CSV at any time.
"""
import math
from pathlib import Path

import cv2
import matplotlib
import numpy as np

matplotlib.use("Agg")  # no window: matplotlib draws straight to a file
import matplotlib.pyplot as plt  # noqa: E402  (must come after matplotlib.use)

from storage import load_trajectories  # noqa: E402


def occupancy_grid(points, width, height, cell_px):
    """Count in how many frames the robot was inside each grid cell.

    Returns an array shaped (rows, cols) like the image: rows = y, cols = x.
    Missed frames are ignored.
    """
    xs = [point.x for point in points if point.detected]
    ys = [point.y for point in points if point.detected]

    counts, _, _ = np.histogram2d(
        ys, xs,
        bins=[math.ceil(height / cell_px), math.ceil(width / cell_px)],
        range=[[0, height], [0, width]],
    )
    return counts


def frame_duration_s(points):
    """Seconds per frame, taken from the CSV itself (no need for the video)."""
    first, last = points[0], points[-1]
    if last.frame == first.frame:
        return 0.0
    return (last.timestamp_s - first.timestamp_s) / (last.frame - first.frame)


def smooth(grid, sigma_cells):
    """Gaussian blur so the map shows regions instead of a checkerboard.

    The blur spreads values but keeps the total, so the sum is still the time tracked.
    """
    if sigma_cells <= 0:
        return grid
    return cv2.GaussianBlur(grid.astype(np.float32), (0, 0), sigma_cells)


def render_heatmap(seconds_grid, background_bgr, title, subtitle, colormap, path):
    height, width = background_bgr.shape[:2]

    # Stretch the grid to the image size (smooth interpolation), so the edge
    # of the transparent area follows the data instead of the 20 px cells
    seconds_grid = cv2.resize(seconds_grid, (width, height), interpolation=cv2.INTER_LINEAR)

    fig, ax = plt.subplots(figsize=(10, 6.4), dpi=120, layout="constrained")

    # Arena in the background, grayed out so the heatmap stands out.
    # OpenCV images are BGR; matplotlib expects RGB.
    gray = cv2.cvtColor(background_bgr, cv2.COLOR_BGR2GRAY)
    ax.imshow(gray, cmap="gray", vmin=0, vmax=255, alpha=0.6)

    # Cells the robot (almost) never visited stay transparent
    visible = np.ma.masked_less_equal(seconds_grid, seconds_grid.max() * 0.02)

    image = ax.imshow(
        visible,
        cmap=colormap,
        alpha=0.75,
        vmin=0,
    )

    colorbar = fig.colorbar(image, ax=ax, fraction=0.03, pad=0.02)
    colorbar.set_label("time in cell (s)")

    fig.suptitle(title, fontsize=20, fontweight="bold")
    ax.set_title(subtitle, fontsize=11, color="#444444")
    ax.set_axis_off()

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)  # free the memory; matters when generating many images
    return path


def render_combined_heatmap(seconds_grids, background_bgr, title, subtitle, colormaps, labels, path):
    """Both robots on one map: each in its own colour, on the same time scale.

    Each robot's layer is as opaque as the time it spent there (faint where it passed by, solid
    where it stayed), so where both robots were the two colours mix instead of one hiding the
    other. Same vmax for both: equal colour means equal time.
    """
    height, width = background_bgr.shape[:2]
    vmax = max((float(grid.max()) for grid in seconds_grids.values()), default=0.0) or 1.0

    fig, ax = plt.subplots(figsize=(10, 6.4), dpi=120, layout="constrained")
    gray = cv2.cvtColor(background_bgr, cv2.COLOR_BGR2GRAY)
    ax.imshow(gray, cmap="gray", vmin=0, vmax=255, alpha=0.6)

    norm = matplotlib.colors.Normalize(vmin=0, vmax=vmax)
    for robot_id, grid in seconds_grids.items():
        grid = cv2.resize(grid, (width, height), interpolation=cv2.INTER_LINEAR)
        # Opacity from the time spent: sqrt so short visits still show; ~0 stays transparent
        strength = np.clip(grid / vmax, 0, 1)
        alpha = np.where(strength > 0.02, 0.85 * np.sqrt(strength), 0.0)
        # The light end of Blues / Reds is almost white and would veil the arena where the
        # robot barely passed; start the colours at a mid tone instead
        full = matplotlib.colormaps[colormaps.get(robot_id, "Greys")]
        cmap = matplotlib.colors.ListedColormap(full(np.linspace(0.35, 1.0, 256)))
        ax.imshow(grid, cmap=cmap, norm=norm, alpha=alpha)
        colorbar = fig.colorbar(
            matplotlib.cm.ScalarMappable(norm=norm, cmap=cmap), ax=ax, fraction=0.03, pad=0.02,
        )
        colorbar.set_label(f"{labels[robot_id]}: time in cell (s)")

    fig.suptitle(title, fontsize=20, fontweight="bold")
    ax.set_title(subtitle, fontsize=11, color="#444444")
    ax.set_axis_off()

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def generate_heatmaps(csv_path, background_bgr, output_dir, robot_names, colormaps,
                      title, cell_px, blur_cells):
    """Read trajectories.csv and write heatmap_robot<id>.png for every robot, plus
    heatmap_combined.png with both robots on one map.

    Returns (robot heatmap paths, combined heatmap path).
    """
    height, width = background_bgr.shape[:2]
    trajectories = load_trajectories(csv_path)
    paths = []
    seconds_grids = {}
    tracked = {}

    for robot_id, points in trajectories.items():
        seconds_per_frame = frame_duration_s(points)
        counts = occupancy_grid(points, width, height, cell_px)
        seconds_grid = smooth(counts, blur_cells) * seconds_per_frame
        seconds_grids[robot_id] = seconds_grid

        detected = int(counts.sum())
        tracked[robot_id] = detected * seconds_per_frame
        subtitle = (
            f"Robot {robot_id} ({robot_names.get(robot_id, '?')}) · "
            f"{detected} of {len(points)} frames · "
            f"{detected * seconds_per_frame:.1f} s tracked"
        )

        paths.append(render_heatmap(
            seconds_grid, background_bgr, title, subtitle,
            colormaps.get(robot_id, "Greys"),
            Path(output_dir) / f"heatmap_robot{robot_id}.png",
        ))

    # Both robots on one map, from the same grids as the maps above
    labels = {rid: f"Robot {rid} ({robot_names.get(rid, '?')})" for rid in seconds_grids}
    combined_subtitle = " · ".join(f"{labels[rid]} {tracked[rid]:.1f} s tracked" for rid in seconds_grids)
    combined_path = render_combined_heatmap(
        seconds_grids, background_bgr, title, combined_subtitle, colormaps, labels,
        Path(output_dir) / "heatmap_combined.png",
    )

    return paths, combined_path
