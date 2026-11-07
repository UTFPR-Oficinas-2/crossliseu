"""HSV calibrator: find the HSV range of one robot's marker.

Run from apps/cv-worker:
    python tools/hsv_calibrator.py --robot 1
    python tools/hsv_calibrator.py --robot 2 --video data/videos/other.mp4

The frame goes through the SAME preprocess() and segmentation functions as the
pipeline, so what you see here is exactly what main.py will get.

Window (2x2):
    original (click to sample)  | raw mask (cv2.inRange only)
    clean mask (open + close)   | result (only the pixels the mask keeps)

Keys:
    space   play / pause
    d / a   next / previous frame
    s       apply the range suggested by the clicked samples
    c       clear the samples
    p       print the range in config.py format
    q / Esc quit (also prints the range)

Hue wrap: when "H min" > "H max" the range wraps around 179 -> 0 and becomes
two ranges (needed for red). E.g. H min 170, H max 10 = 170-179 + 0-10.
"""
import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

SRC_DIR = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC_DIR))

from config import BLUR_KERNEL, DEFAULT_VIDEO, MORPH_KERNEL, ROBOT_COLORS, ROBOT_NAMES  # noqa: E402
from debug import grid, tile_scale, to_tile  # noqa: E402
from preprocessing import preprocess  # noqa: E402
from segmentation import clean_mask, count_regions, create_mask  # noqa: E402

VIEW = "hsv calibrator"
CONTROLS = "controls"
H_LIMIT = 179
SAMPLE_RADIUS = 2       # a click samples a 5x5 patch around the pixel
MARGIN = (5, 40, 40)    # margin added around the samples for H, S, V

# (trackbar name, max value)
TRACKBARS = [
    ("H min", H_LIMIT), ("H max", H_LIMIT),
    ("S min", 255), ("S max", 255),
    ("V min", 255), ("V max", 255),
    ("Blur", 31), ("Morph", 31),
]


# ---------- range <-> trackbar bounds ----------

def bounds_to_ranges(b):
    """Trackbar bounds -> list of (lower, upper), splitting a wrapped hue."""
    s_v_low = (b["S min"], b["V min"])
    s_v_high = (b["S max"], b["V max"])

    if b["H min"] <= b["H max"]:
        return [((b["H min"], *s_v_low), (b["H max"], *s_v_high))]

    return [
        ((b["H min"], *s_v_low), (H_LIMIT, *s_v_high)),
        ((0, *s_v_low), (b["H max"], *s_v_high)),
    ]


def ranges_to_bounds(ranges):
    """config.py ranges -> trackbar bounds (inverse of bounds_to_ranges)."""
    lows = [lower for lower, _ in ranges]
    highs = [upper for _, upper in ranges]

    if len(ranges) == 1:
        h_min, h_max = lows[0][0], highs[0][0]
    else:
        # Wrapped red: the range that ends at 179 gives H min,
        # the range that starts at 0 gives H max.
        high_part = max(ranges, key=lambda r: r[0][0])
        low_part = min(ranges, key=lambda r: r[0][0])
        h_min, h_max = high_part[0][0], low_part[1][0]

    return {
        "H min": h_min, "H max": h_max,
        "S min": min(l[1] for l in lows), "S max": max(h[1] for h in highs),
        "V min": min(l[2] for l in lows), "V max": max(h[2] for h in highs),
    }


def suggest_bounds(samples):
    """Min/max of the clicked samples plus MARGIN.

    If the hues sit on both ends of the circle (e.g. 2 and 177), they are
    shifted by 90 before taking min/max, so the result wraps correctly.
    """
    h = samples[:, 0].astype(int)
    shift = 90 if h.max() - h.min() > 90 else 0
    shifted = (h + shift) % 180

    return {
        "H min": int((shifted.min() - MARGIN[0] - shift) % 180),
        "H max": int((shifted.max() + MARGIN[0] - shift) % 180),
        "S min": int(max(samples[:, 1].min() - MARGIN[1], 0)),
        "S max": int(min(samples[:, 1].max() + MARGIN[1], 255)),
        "V min": int(max(samples[:, 2].min() - MARGIN[2], 0)),
        "V max": int(min(samples[:, 2].max() + MARGIN[2], 255)),
    }


def format_ranges(robot_id, ranges):
    pairs = ", ".join(f"({tuple(lower)}, {tuple(upper)})" for lower, upper in ranges)
    return f"    {robot_id}: [{pairs}],  # {ROBOT_NAMES.get(robot_id, '')}"


# ---------- trackbars ----------

def create_controls(initial):
    cv2.namedWindow(CONTROLS, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(CONTROLS, 500, 330)
    for name, max_value in TRACKBARS:
        cv2.createTrackbar(name, CONTROLS, initial[name], max_value, lambda _: None)


def read_controls():
    return {name: cv2.getTrackbarPos(name, CONTROLS) for name, _ in TRACKBARS}


def set_controls(bounds):
    for name, value in bounds.items():
        cv2.setTrackbarPos(name, CONTROLS, value)


# ---------- mouse ----------

def on_mouse(event, x, y, flags, state):
    if event != cv2.EVENT_LBUTTONDOWN or state["hsv"] is None:
        return

    scale = state["scale"]
    height, width = state["hsv"].shape[:2]
    fx, fy = int(x / scale), int(y / scale)

    if fx >= width or fy >= height:  # only the "original" tile can be sampled
        return

    r = SAMPLE_RADIUS
    patch = state["hsv"][max(fy - r, 0):fy + r + 1, max(fx - r, 0):fx + r + 1]
    state["samples"].append(patch.reshape(-1, 3))

    samples = np.vstack(state["samples"])
    suggestion = suggest_bounds(samples)
    print(
        f"x={fx} y={fy}  HSV={tuple(int(v) for v in state['hsv'][fy, fx])}  "
        f"patch mean={tuple(int(v) for v in patch.reshape(-1, 3).mean(axis=0))}  "
        f"| {len(state['samples'])} clicks -> suggested "
        f"H {suggestion['H min']}-{suggestion['H max']} "
        f"S {suggestion['S min']}-{suggestion['S max']} "
        f"V {suggestion['V min']}-{suggestion['V max']}  (press s to apply)"
    )


# ---------- main loop ----------

def read_at(capture, index):
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    return frame if ok else None


def parse_args():
    parser = argparse.ArgumentParser(description="HSV calibrator")
    parser.add_argument("--robot", type=int, choices=sorted(ROBOT_COLORS), required=True)
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    return parser.parse_args()


def main():
    args = parse_args()

    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        raise SystemExit(f"Couldn't open the video: {args.video}")

    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    delay = max(int(1000 / fps), 1)

    initial = ranges_to_bounds(ROBOT_COLORS[args.robot])
    initial.update({"Blur": BLUR_KERNEL, "Morph": MORPH_KERNEL})
    create_controls(initial)

    state = {"hsv": None, "scale": 1.0, "samples": []}
    cv2.namedWindow(VIEW)
    cv2.setMouseCallback(VIEW, on_mouse, state)

    index = 0
    frame = read_at(capture, index)
    paused = False
    print(__doc__)

    while True:
        bounds = read_controls()
        ranges = bounds_to_ranges(bounds)

        # Same steps as the pipeline
        frame_hsv = preprocess(frame, bounds["Blur"])
        raw = create_mask(frame_hsv, ranges)
        clean = clean_mask(raw, bounds["Morph"])
        result = cv2.bitwise_and(frame, frame, mask=clean)

        state["hsv"] = frame_hsv
        state["scale"] = scale = tile_scale(frame)

        white = 100 * cv2.countNonZero(clean) / clean.size
        status = "paused" if paused else "playing"
        cv2.imshow(VIEW, grid(
            to_tile(frame, scale, f"frame {index}/{total - 1} ({status})  click to sample"),
            to_tile(raw, scale, f"raw mask  regions: {count_regions(raw)}"),
            to_tile(clean, scale, f"clean mask  regions: {count_regions(clean)}  white: {white:.2f}%"),
            to_tile(result, scale, f"robot {args.robot} ({ROBOT_NAMES[args.robot]})  {len(ranges)} range(s)"),
        ))

        key = cv2.waitKey(delay if not paused else 30) & 0xFF

        if key in (ord("q"), 27) or cv2.getWindowProperty(VIEW, cv2.WND_PROP_VISIBLE) < 1:
            break
        if key == ord(" "):
            paused = not paused
        elif key == ord("p"):
            print(format_ranges(args.robot, ranges))
        elif key == ord("s") and state["samples"]:
            set_controls(suggest_bounds(np.vstack(state["samples"])))
        elif key == ord("c"):
            state["samples"].clear()
            print("samples cleared")

        step = 0
        if key == ord("d"):
            step = 1
        elif key == ord("a"):
            step = -1
        elif not paused:
            step = 1

        if step:
            index = (index + step) % total  # loops at the end of the video
            frame = read_at(capture, index) if step < 0 else capture.read()[1]
            if frame is None:  # end reached earlier than FRAME_COUNT said
                index = 0
                frame = read_at(capture, 0)

    print("\nPaste into ROBOT_COLORS in src/config.py:")
    print(format_ranges(args.robot, bounds_to_ranges(read_controls())))
    capture.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
