# CV worker pipeline

How `apps/cv-worker` turns a match recording into robot trajectories and heatmaps. The worker is built in small steps; each section says whether the stage is **done**, **in progress** or **planned**. Update this document when a stage changes what it takes or returns.

So far every stage has been validated on the synthetic video `data/videos/test_two_robots_red_blue_compatible.mp4` (1280×720, 30 fps, 600 frames). No real arena footage with the markers exists yet; see [Open questions](#open-questions).

## Scope

- **Input:** one video file of one match, filmed from above the arena.
- **Output:** one trajectory file per match and one heatmap image per robot.
- **The worker only looks at the video.** It knows nothing about scores, referees or the match timer. It does not talk to the database or the API until the [persistence](#persistence) stage, which comes after the pipeline works on local videos.
- **The worker runs without a screen.** Windows and drawings are a debug option, never part of the pipeline (see [Debug view](#debug-view)).

## Running

From `apps/cv-worker`, with the virtual environment active:

```bash
pip install -r requirements.txt                      # opencv-python, numpy, matplotlib

python src/main.py                                   # default video, with the debug window
python src/main.py --video data/videos/<file>.mp4    # another video
python src/main.py --no-display                      # no windows (server mode)

python tools/hsv_calibrator.py --robot 1             # calibrate a robot's color
```

A run prints a summary per stage and writes its results to `data/output/<video name>/`.

## Robots and colors

Each robot carries a colored marker. The color is the robot's identity in the video, so the worker never has to guess which robot is which.

| Robot | Side in the API | Marker color |
| --- | --- | --- |
| Robot 1 | `A` (`robot_a_id`) | Blue |
| Robot 2 | `B` (`robot_b_id`) | Red |

The color ranges live in `ROBOT_COLORS` in `config.py`. The arena, the lighting and the marker material all change them, so they are measured with the [HSV calibrator](#hsv-calibration) and never guessed.

## Pipeline

![alt text](image.png)

Each stage is one module in `src/`. A stage takes plain data (NumPy arrays, numbers, small dataclasses) and returns plain data, so it can be tested alone with a synthetic frame.

| # | Stage | Module | Takes | Returns | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | [Capture](#1-capture) | `capture.py` | Video path | BGR frames, `fps`, `width`, `height` | Done |
| 2 | [Preprocessing](#2-preprocessing) | `preprocessing.py` | BGR frame | HSV frame | Done |
| 3 | [Segmentation](#3-segmentation) | `segmentation.py` | HSV frame, color ranges | Clean binary mask per robot | Done (arena mask planned) |
| 4 | [Detection](#4-detection) | `detection.py` | Mask per robot | `Detection` or `None` per robot | Done |
| 5 | [Arena mapping](#5-arena-mapping) | `arena.py` | Pixel position | Arena position | Planned |
| 6 | [Tracking](#6-tracking) | `tracking.py` | Detections per frame | `TrajectoryPoint` per robot per frame | Done |
| 7 | [Storage](#7-storage) | `storage.py` | Trajectories | `trajectories.csv` (validated) | Done |
| 8 | [Heatmap](#8-heatmap) | `heatmap.py` | `trajectories.csv`, background frame | One PNG per robot | Done |

`main.py` only wires the stages together in this order and prints a summary at the end.

### 1. Capture

`VideoCapture` wraps `cv2.VideoCapture` and reads the video frame by frame.

- Fails right away if the file cannot be opened.
- Each frame is a NumPy array of shape `(height, width, 3)` in **BGR** order (OpenCV's default). `read_frame()` returns `None` at the end of the video.
- Exposes `fps` (from `CAP_PROP_FPS`, falling back to 30 when the file reports 0), `width` and `height`.
- The timestamp of a frame is `frame_index / fps`, in seconds from the start of the video, rounded to 3 decimals. `main.py` computes it.
- The capture is released when the video ends or the run is stopped, even on an error.

### 2. Preprocessing

Prepares the frame for segmentation. It never detects anything.

1. **Noise reduction:** `cv2.GaussianBlur` with an odd kernel (`BLUR_KERNEL`, made odd if needed; `0` disables it). Smooths out sensor noise so single pixels don't flicker in and out of the masks.
2. **Color space:** `BGR → HSV` with `cv2.cvtColor`. In HSV the color (H) is separated from how strong (S) and how bright (V) it is, so one range covers a marker under brighter and darker lighting.

OpenCV's HSV uses `H` in `0–179` (degrees divided by 2) and `S`, `V` in `0–255`. Ranges taken from other tools (0–360, 0–100 %) must be converted.

### 3. Segmentation

Turns the HSV frame into one binary mask per robot: white where a pixel has the robot's color, black everywhere else.

1. **Color mask:** `cv2.inRange(frame_hsv, lower, upper)` for each range of the robot's color.
2. **Combine ranges:** a color may need more than one range. **Red always does**, because its hue wraps around: it sits at both ends of `H` (about `0–10` and `170–179`). The masks of all ranges are joined with `cv2.bitwise_or`.
3. **Cleanup:** morphological **opening** (erode then dilate: removes small white specks) followed by **closing** (dilate then erode: fills small holes inside the marker), with an elliptical kernel of size `MORPH_KERNEL`.
4. **Arena mask (planned):** pixels outside the arena are set to black, so a red shirt in the audience never becomes a robot.

Config shape for the color ranges:

```python
ROBOT_COLORS = {
    1: [((100, 120, 50), (130, 255, 255))],                                  # blue
    2: [((170, 120, 70), (179, 255, 255)), ((0, 120, 70), (10, 255, 255))],  # red
}
```

These values work on the synthetic video; they must be calibrated again on real footage.

`count_regions(mask)` counts the separate white regions (outer contours only) and is used to validate a mask: a good mask has exactly **1 region** per robot in (almost) every frame.

### 4. Detection

Turns each clean mask into at most one robot position.

1. `cv2.findContours` on the mask with `RETR_EXTERNAL`: only outer contours, so holes inside a region (like the letter printed on the synthetic marker) do not become contours.
2. For each contour, `cv2.moments` gives the **area** (`m00`) and the **centroid** (`x = m10/m00`, `y = m01/m00`). Using the contour instead of the mask keeps holes from pulling the centroid off-center.
3. Contours smaller than `MIN_CONTOUR_AREA` pixels are dropped (leftover noise and reflections).
4. The **largest** remaining contour is the robot; with none left, the robot is `None` for that frame.

The result is a `Detection(x, y, area, bbox)` per robot, where `bbox` comes from `cv2.boundingRect` and is only used for drawing. Identification is free: the blue mask can only give robot 1 and the red mask can only give robot 2.

### 5. Arena mapping

Planned. Converts a position in pixels into a position on the arena floor, so the heatmap does not depend on the camera angle or the video resolution.

- The four corners of the arena are marked once per camera setup and saved in the config.
- `cv2.getPerspectiveTransform` builds the transform from those corners to a square, and `cv2.perspectiveTransform` applies it to each centroid.
- The result is `x_arena`, `y_arena` in `0.0–1.0`, where `(0, 0)` is the top-left corner of the arena as seen in the video.
- The same four corners give the polygon for the arena mask in [segmentation](#3-segmentation).

Until this stage exists, `x_arena` and `y_arena` are left empty and the heatmap uses pixels.

### 6. Tracking

`Tracker` records one `TrajectoryPoint` per robot per frame and rejects impossible jumps.

```python
TrajectoryPoint(robot_id=1, frame=120, timestamp_s=4.0, detected=True, x=591, y=204, area=7050.0)
```

For every frame and robot:

1. If the robot was seen before, the new detection may be at most `MAX_SPEED_PX_PER_FRAME × frames since last seen` pixels away from the last accepted position. Farther than that is an **impossible jump**: the detection is rejected and counted in `rejected`.
2. A rejected or missing detection is recorded as a **miss** (`detected=False`, no position). Misses are never skipped or filled in.
3. An accepted detection becomes the new last position.

Because the allowed distance grows with every missed frame, a robot that was hidden for a while is accepted again when it reappears farther away.

The tracker keeps three dicts keyed by robot: `last_seen` (`(x, y, frame)` of the last accepted position), `trajectories` (the full list of points) and `rejected` (count of impossible jumps).

Smoothing, short-gap interpolation or a Kalman filter can be added later if the trajectories turn out to be noisy.

### 7. Storage

Writes the trajectory of both robots to `data/output/<video name>/trajectories.csv`. This file is the contract between the pipeline and everything that reads its results (heatmap, statistics, and later the backend). The folder is not committed (`apps/cv-worker/.gitignore`).

One row per robot per frame, misses included, ordered by frame and then robot:

| Column | Type | Notes |
| --- | --- | --- |
| `frame` | integer | Frame index, starting at `0` |
| `timestamp_s` | float | Seconds from the start of the video, 3 decimals |
| `robot_id` | `1` \| `2` | See [Robots and colors](#robots-and-colors) |
| `detected` | `0` \| `1` | `0` for a miss; the position columns are then empty |
| `x_px`, `y_px` | integer | Centroid in pixels |
| `x_arena`, `y_arena` | float | Position on the arena, `0.0–1.0`; empty until [arena mapping](#5-arena-mapping) exists |
| `area` | integer | Contour area in pixels; helps spot bad detections |

```csv
frame,timestamp_s,robot_id,detected,x_px,y_px,x_arena,y_arena,area
0,0.000,1,1,430,480,,,7054
0,0.000,2,1,1011,382,,,7051
1,0.033,1,1,433,484,,,7050
1,0.033,2,0,,,,,
```

Before writing, `save_trajectories` validates every point and **writes nothing** if any check fails, listing the problems instead:

- `robot_id` is a configured robot;
- `frame` grows by one per frame and `timestamp_s` never goes back;
- a detected position is inside the frame (and inside `0.0–1.0` once arena mapping exists);
- a miss has every position column empty.

`load_trajectories` reads the file back into `{robot_id: [TrajectoryPoint, ...]}`.

The **detection rate** of a robot is its number of `detected = 1` rows divided by its number of rows. It is the first number to check when changing calibration or cleanup, and it maps to `detectedPositions` in the web app's `RobotHeatmap` type.

When a run is stopped with `q`, the frames processed so far are still saved.

### 8. Heatmap

Reads `trajectories.csv` (never the video pipeline's memory) and draws `heatmap_robot<id>.png` per robot in the same folder, with matplotlib.

1. Take the robot's detected positions (misses are ignored).
2. Count them in a grid of `HEATMAP_CELL_PX`-pixel cells with `numpy.histogram2d` (1280×720 with 20 px cells → 64×36 cells).
3. Multiply by the duration of a frame, taken from the CSV's own timestamps, so each cell holds **seconds**.
4. Smooth the grid with a Gaussian blur (`HEATMAP_BLUR_CELLS`). The blur spreads the time but keeps the total.
5. Draw it over a grayed background frame: the grid is resized to the frame size, cells under 2 % of the maximum are transparent, and a colorbar shows the time per cell.

Each robot uses one hue from light to dark (`HEATMAP_COLORMAPS`: `Blues` for robot 1, `Reds` for robot 2), never a rainbow scale. The image has the title `HEATMAP_TITLE` ("Crossliseu") and a subtitle with the robot, the frames detected and the seconds tracked.

The background is currently the first frame of the video, so the robots appear in it. A photo of the empty arena is the planned replacement.

Statistics (distance traveled, average speed, time per arena region) are computed from the same file and come after the heatmap.

## Configuration

Everything that may need tuning lives in `src/config.py`:

| Setting | Stage | Meaning |
| --- | --- | --- |
| `DEFAULT_VIDEO`, `OUTPUT_DIR` | Main | Default input video and results folder |
| `ROBOT_NAMES` | All | Name of each robot in logs, windows and images |
| `ROBOT_COLORS` | Segmentation | HSV ranges per robot |
| `BLUR_KERNEL` | Preprocessing | Gaussian blur kernel; `0` disables it |
| `MORPH_KERNEL` | Segmentation | Opening and closing kernel; `0` disables it |
| `MIN_CONTOUR_AREA` | Detection | Smallest region, in pixels, that can be a robot |
| `MAX_SPEED_PX_PER_FRAME` | Tracking | Speed limit for the impossible-jump check |
| `HEATMAP_TITLE`, `HEATMAP_CELL_PX`, `HEATMAP_BLUR_CELLS`, `HEATMAP_COLORMAPS` | Heatmap | Title, grid cell size, smoothing and colors |

`MIN_CONTOUR_AREA` and `MAX_SPEED_PX_PER_FRAME` depend on the size and speed of the robots in the image, so they must be measured again on real footage. On the synthetic video the marker is about 7000 px and moves at most about 7 px per frame.

## Validating a run

The summary printed at the end of `main.py` is the first thing to check:

```text
Segmentation summary (600 frames)
  robot 1 (blue): 1 region 600 (100.0%) | none 0 (0.0%) | 2+ regions 0 (0.0%)
Detection summary (600 frames)
  robot 1 (blue): detected 600 (100.0%) | missed 0 (0.0%)
Tracking summary (600 frames)
  robot 1 (blue): 600 points | accepted 600 (100.0%) | rejected jumps 0
```

| Symptom | Likely cause |
| --- | --- |
| Many `none` / `missed` | HSV range too narrow, or `MIN_CONTOUR_AREA` too high |
| Many `2+ regions` | HSV range too wide (catches other objects), or cleanup too weak |
| Many `rejected jumps` | `MAX_SPEED_PX_PER_FRAME` too low, or false detections far from the robot |

## HSV calibration

`tools/hsv_calibrator.py --robot <id> [--video <path>]` finds a robot's HSV range. It runs the frame through the same `preprocess`, `create_mask` and `clean_mask` as the pipeline, so what it shows is exactly what `main.py` gets.

- **Controls window:** trackbars for `H`, `S`, `V` min and max, plus the blur and cleanup kernels, starting from the values in `config.py`.
- **View window (2×2):** original frame, raw mask, clean mask (with its region count) and the pixels the mask keeps.
- **Click** the marker on the original frame to sample a 5×5 patch. The terminal prints its HSV and a range suggested from all samples (min/max plus a margin); `s` applies it to the trackbars, `c` clears the samples.
- **Hue wrap:** when `H min` > `H max`, the range wraps around 179 → 0 and becomes two ranges (needed for red).
- **Keys:** `space` play/pause, `d`/`a` next/previous frame, `p` print the range, `q` quit and print the range in `ROBOT_COLORS` format.

The range is good when the marker is fully white through the whole video, including in corners and under shadows, and nothing else is. Calibrate again whenever the camera, the lighting or the markers change.

## Debug view

Unless `--no-display` is passed, `main.py` opens a 2×2 window:

| | |
| --- | --- |
| Frame with each robot's bounding box, centroid, `R<id> (x, y)` label and its trail over the last 3 s | Overlay with robot 1's mask painted green and robot 2's magenta |
| Robot 1 mask, with its region count | Robot 2 mask, with its region count |

A trail is broken where the robot was missed, so gaps are visible. `q` stops the run (the results so far are still saved). All drawing lives in `debug.py`; the pipeline modules never call `cv2.imshow`, so the same code runs on a server with no display.

## Folder structure

```text
apps/cv-worker/
├── requirements.txt
├── .gitignore           # ignores data/output/
├── data/
│   ├── videos/          # sample match videos
│   └── output/          # one folder per video: trajectories.csv and heatmaps (not committed)
├── tools/
│   └── hsv_calibrator.py
└── src/
    ├── main.py
    ├── config.py
    ├── capture.py
    ├── preprocessing.py
    ├── segmentation.py
    ├── detection.py
    ├── tracking.py
    ├── storage.py
    ├── heatmap.py
    └── debug.py
```

Planned: `src/arena.py` for [arena mapping](#5-arena-mapping), and a `tests/` folder with pytest tests on synthetic frames (for example a blue circle on a gray image).

## Persistence

Planned, after the pipeline works on local videos. The worker will hand `trajectories.csv` (or the same rows) and the heatmap images to the API for a given `matchId`; the API stores them and fills the match's `analysisStatus` and `heatmaps`. The upload format and the endpoint are not decided yet and will be added to this document when they are.

## Open questions

- **Real footage.** The pipeline has only run on a synthetic video. A recording of the real arena with the blue and red markers is needed to calibrate `ROBOT_COLORS`, `MIN_CONTOUR_AREA` and `MAX_SPEED_PX_PER_FRAME`, and to take the empty-arena photo for the heatmap background.
- **Video start vs. match start.** `timestamp_s` counts from the start of the video, which may begin before the match starts. Aligning it with the `started` event's `occurred_at` needs either a trimmed video or a known offset.
- **Pauses.** Between a `paused` and the next `resumed` event (`match_events`) the robots stand still, which would inflate their heatmap cells. Those frames should probably be dropped once the offset above is known.
- **Marker occlusion.** A robot that flips or hides its marker behind the opponent produces misses. The detection rate on real footage will tell whether this needs more than the first version of tracking.

## Development order

1. Capture and display frames. **Done**
2. Convert BGR → HSV, with noise reduction. **Done**
3. Build the HSV calibrator. **Done** (calibration on real footage pending)
4. Generate and clean one mask per robot (red with two ranges). **Done**
5. Find contours and compute each robot's centroid. **Done**
6. Track one position or a miss per robot per frame. **Done**
7. Write and validate `trajectories.csv`. **Done**
8. Draw the heatmaps. **Done**
9. Calibrate on real footage and use an empty-arena background.
10. Mask out everything outside the arena and map positions to arena coordinates.
11. Add statistics.
12. Send the results to the API.
