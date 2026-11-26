# Computer Vision Worker

Worker responsible for processing battle videos using Python and OpenCV.

---

## Requirements

- Python 3.12+
- pip

---

## Setup

Create a virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment:

```bash
venv\Scripts\activate
```

Install the project dependencies:

```bash
pip install -r requirements.txt
```

The virtual environment is used to keep the project dependencies isolated from the rest of the system.

The `requirements.txt` file contains the Python libraries required by the project, such as OpenCV.

After completing these steps, the Computer Vision Worker will be ready to run.


To run the worker:
```bash
python .\src\main.py
```

---

## Time limits

Production runs one worker that takes one job at a time, so a job that hangs (a stuck video decode, a
download that never returns) would block every later analysis. Three limits keep that from happening
(#133):

| Limit | Where | Default | What happens |
|-------|-------|---------|--------------|
| `CV_JOB_TIMEOUT_S` | worker | 1200 s (20 min) | The job's process is killed, the analysis fails with `processing_timeout`, the request is acked and the worker takes the next job. A timeout is not retried: a video that hangs once is likely to hang again. |
| `consumer_timeout` | RabbitMQ | 30 min | The broker closes the worker's channel and puts the unacked request back in the queue. |
| Stale-analysis sweep | API | `running` 45 min, `pending` 6 h | The analysis is marked `failed` with `processing_timeout`, so the web app stops showing it as running. |

Each job runs in a child process, so a hung job can really be stopped (a Python thread cannot be
killed); the worker owns the job's temporary directory and removes it, even after a kill. A child
that dies without a result (out of memory, a crash inside OpenCV) counts as a transient failure and
is retried once, then the analysis fails with `processing_failed`. On SIGTERM the worker kills the
running job and leaves its message unacked, so it runs again after the restart.

`CV_JOB_TIMEOUT_S` must stay well below `consumer_timeout`. At or above it, RabbitMQ closes the
channel while the job still runs, the worker can no longer ack or report on that channel, and the
request is delivered again: the same job hangs again, over and over.

**When RabbitMQ closes the channel.** pika raises `ChannelClosedByBroker` (406
`PRECONDITION_FAILED - delivery acknowledgement ... timed out`) from `start_consuming`. Before #133
the worker only handled connection errors, so this ended the worker process and the container
restarted it. Now the worker kills the job in hand (its request is already back in the queue),
closes the connection and consumes again on a new one.

---

## Research

### OpenCV Python Tutorials

Official OpenCV documentation for Python:

https://docs.opencv.org/5.0/py_tutorials/py_tutorials.html
