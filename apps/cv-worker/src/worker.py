"""CV worker: consumes analysis jobs from RabbitMQ, one at a time.

    analysis.requested  -> {"matchId", "videoKey"}         (published by the API)
    analysis.finished   <- {"matchId", "videoKey", "status": ...}   (consumed by the API)

For each job it publishes "running", then "done" or "failed", and acks the request only at the
end, so a worker that dies mid-job leaves the message in the queue for the next one.

Each job runs in a child process with a time limit (CV_JOB_TIMEOUT_S). A job past it is killed and
reported failed with processing_timeout, and the worker takes the next one (#133).

Environment:
    RABBITMQ_URL     amqp://user:password@rabbitmq:5672/
    R2_*             see docs/recording-storage.md
    CV_MOCK_VIDEO    optional: process this file instead of the recording (see jobs.run_job)
    CV_JOB_TIMEOUT_S optional: seconds a job may run before it is killed (default 1200). Keep it
                     well below RabbitMQ's consumer_timeout (30 min), see README "Time limits"
"""
import json
import logging
import math
import multiprocessing
import os
import shutil
import signal
import tempfile
import threading
import time

import pika

from jobs import PermanentJobError, failed_message, parse_request, run_job
from object_storage import ObjectStorage, R2Settings

REQUEST_QUEUE = "analysis.requested"
RESULT_QUEUE = "analysis.finished"

# A job that fails for a transient reason runs at most this many times. The count travels in the
# `x-attempt` header of the message. `method.redelivered` can't be used for it: RabbitMQ also sets
# it after a crash or a SIGTERM, which is not a failed attempt.
MAX_ATTEMPTS = 2
ATTEMPT_HEADER = "x-attempt"

# A job running longer than this is killed and fails with processing_timeout. 20 min: generous for
# a 16-min video (the upload limit), and 10 min below RabbitMQ's consumer_timeout, so the worker
# reports the timeout before the broker takes the delivery back.
DEFAULT_JOB_TIMEOUT_S = 1200
# RabbitMQ's default consumer_timeout, not overridden in compose: a job limit at or above it is lost
CONSUMER_TIMEOUT_S = 30 * 60
# Prefix of each job's directory in the system temp dir (see ChildJobRunner.run)
JOB_DIR_PREFIX = "cv-job-"

# Exists while the worker is connected and consuming; the container healthcheck looks for it
HEALTH_FILE = os.environ.get("WORKER_HEALTH_FILE", "/tmp/worker-healthy")

log = logging.getLogger("cv-worker")


def set_healthy(healthy):
    try:
        if healthy:
            open(HEALTH_FILE, "w").close()
        elif os.path.exists(HEALTH_FILE):
            os.remove(HEALTH_FILE)
    except OSError as error:
        log.warning("could not update %s: %s", HEALTH_FILE, error)


def declare_queues(channel):
    # Durable: the queues and their persistent messages survive a RabbitMQ restart
    channel.queue_declare(queue=REQUEST_QUEUE, durable=True)
    channel.queue_declare(queue=RESULT_QUEUE, durable=True)


def publish(channel, message):
    channel.basic_publish(
        exchange="",
        routing_key=RESULT_QUEUE,
        body=json.dumps(message),
        properties=pika.BasicProperties(
            content_type="application/json",
            delivery_mode=pika.DeliveryMode.Persistent,
        ),
    )


def child_main(conn, body, mock_video, workdir):
    """Runs in the job's child process: one job, then exactly one message back on `conn`."""
    try:
        storage = ObjectStorage.from_settings(R2Settings.from_env())
        conn.send(("done", run_job(body, storage, mock_video, workdir=workdir)))
    except PermanentJobError as error:
        conn.send(("permanent", error.code, str(error)))
    except Exception as error:  # transient: network, R2
        conn.send(("transient", repr(error)))
    finally:
        conn.close()


def job_timeout_from_env(value):
    """Seconds a job may run, from CV_JOB_TIMEOUT_S (unset or empty: 20 min). Exits on a value that
    is not a positive number: 0 would fail every job at once."""
    if value is None or not value.strip():
        return DEFAULT_JOB_TIMEOUT_S
    try:
        timeout_s = float(value)
    except ValueError:
        timeout_s = None
    if timeout_s is None or not math.isfinite(timeout_s) or timeout_s <= 0:
        raise SystemExit(f"CV_JOB_TIMEOUT_S must be a positive number of seconds, got {value!r}")
    if timeout_s >= CONSUMER_TIMEOUT_S:
        log.warning(
            "CV_JOB_TIMEOUT_S=%g is not below RabbitMQ's consumer_timeout (%d s): a hung job will be "
            "taken back and delivered again before the worker can report the timeout",
            timeout_s,
            CONSUMER_TIMEOUT_S,
        )
    return timeout_s


def remove_leftover_job_dirs(tmp_dir=None):
    """Removes job directories a previous run left behind (a SIGTERM mid-job can end the worker
    before the job thread cleans up; the container keeps /tmp across restarts). One worker per
    container, so at startup no job of ours is running. Returns how many were removed."""
    tmp_dir = tmp_dir or tempfile.gettempdir()
    removed = 0
    for entry in os.scandir(tmp_dir):
        if entry.name.startswith(JOB_DIR_PREFIX) and entry.is_dir(follow_symlinks=False):
            shutil.rmtree(entry.path, ignore_errors=True)
            removed += 1
    return removed


class ChildJobRunner:
    """Runs one job at a time in a child process, so a job that hangs can be stopped for real (a
    thread cannot be killed). The parent owns the job's directory and removes it, even when the
    child is killed."""

    def __init__(self, timeout_s, mock_video=None, target=child_main, context="spawn"):
        self.timeout_s = timeout_s
        self.mock_video = mock_video
        self._target = target
        # spawn: a fresh interpreter, nothing inherited from the worker's threads or its RabbitMQ socket
        self._context = multiprocessing.get_context(context)
        self._lock = threading.Lock()
        self._child = None

    def run(self, body):
        """The job's result message. Raises PermanentJobError (processing_timeout past the limit, or
        the code the job raised) or RuntimeError (transient error, or the child died or was killed)."""
        workdir = tempfile.mkdtemp(prefix=JOB_DIR_PREFIX)
        receiver, sender = self._context.Pipe(duplex=False)
        child = self._context.Process(
            target=self._target, args=(sender, body, self.mock_video, workdir), daemon=True
        )
        started = time.monotonic()
        try:
            child.start()
            with self._lock:
                self._child = child
            sender.close()  # only the child writes: EOF on the receiver once it is gone
            if not receiver.poll(self.timeout_s):
                child.kill()
                raise PermanentJobError(
                    "processing_timeout",
                    f"the job ran past the {self.timeout_s:g} s limit "
                    f"({time.monotonic() - started:.0f} s) and was stopped",
                )
            try:
                outcome = receiver.recv()
            except EOFError:
                child.join()
                raise RuntimeError(f"the job's process ended without a result (exit code {child.exitcode})")
        finally:
            with self._lock:
                # After a reconnect a newer run may already hold the slot: leave it to that one
                if self._child is child:
                    self._child = None
            if child.is_alive():
                child.kill()
            if child.pid is not None:
                child.join()
            receiver.close()
            sender.close()
            shutil.rmtree(workdir, ignore_errors=True)

        kind = outcome[0]
        if kind == "done":
            return outcome[1]
        if kind == "permanent":
            raise PermanentJobError(outcome[1], outcome[2])
        raise RuntimeError(outcome[1])

    def kill(self):
        """Kill the running job, if any. Safe from another thread (SIGTERM) and when idle."""
        with self._lock:
            child = self._child
        if child is not None and child.is_alive():
            child.kill()


class Worker:
    def __init__(self, url, runner):
        self.url = url
        self.runner = runner
        self.connection = None
        self.channel = None
        self._stopping = threading.Event()

    def run_forever(self):
        """Connect (retrying while RabbitMQ starts) and consume until stopped."""
        while not self._stopping.is_set():
            try:
                self.connection = pika.BlockingConnection(pika.URLParameters(self.url))
                if self._stopping.is_set():
                    # SIGTERM arrived while connecting: stop() found no open connection to stop
                    self.connection.close()
                    return
                self.channel = self.connection.channel()
                declare_queues(self.channel)
                # One job at a time: the next message only comes after this one is acked
                self.channel.basic_qos(prefetch_count=1)
                self.channel.basic_consume(queue=REQUEST_QUEUE, on_message_callback=self.on_message)
                log.info(
                    "waiting for jobs on %s (mock video: %s)",
                    REQUEST_QUEUE,
                    getattr(self.runner, "mock_video", None) or "off",
                )
                set_healthy(True)
                self.channel.start_consuming()
                set_healthy(False)
                return  # stop() was called
            except pika.exceptions.AMQPChannelError as error:
                # RabbitMQ closed the channel, e.g. consumer_timeout on a delivery left unacked too
                # long. The broker has already put the message back in the queue: stop the job in
                # hand, or it would run next to its own redelivery, then consume again at once.
                set_healthy(False)
                log.warning("RabbitMQ closed the channel (%s); stopping the job and reconnecting", error)
                self.runner.kill()
                self.close_connection()
            except pika.exceptions.AMQPConnectionError as error:
                set_healthy(False)
                log.warning("RabbitMQ not reachable (%s); retrying in 5 s", error)
                # A connection lost mid-job also puts the message back in the queue
                self.runner.kill()
                # Wakes up at once if stop() is called while waiting
                self._stopping.wait(5)

    def close_connection(self):
        try:
            if self.connection and self.connection.is_open:
                self.connection.close()
        except pika.exceptions.AMQPError as error:
            log.warning("could not close the old connection: %s", error)

    def stop(self):
        self._stopping.set()
        # The current job's message stays unacked: process() sees _stopping and leaves it alone
        self.runner.kill()
        if self.connection and self.connection.is_open:
            self.connection.add_callback_threadsafe(self.channel.stop_consuming)

    def on_message(self, channel, method, properties, body):
        # The pipeline takes minutes; running it here would block the connection's heartbeats
        # and RabbitMQ would drop the worker mid-job. It runs in a thread and hands the ack back.
        # The thread keeps the channel the message came on: a delivery tag is only valid there.
        threading.Thread(target=self.process, args=(channel, method, properties, body), daemon=True).start()

    @staticmethod
    def attempts(properties):
        """How many times this job has run, counting the delivery in hand (1 on the first)."""
        headers = getattr(properties, "headers", None) or {}
        try:
            return max(1, int(headers.get(ATTEMPT_HEADER, 1)))
        except (TypeError, ValueError):
            return 1

    def process(self, channel, method, properties, body):
        tag = method.delivery_tag
        match_id = None
        try:
            match_id, video_key = parse_request(body)
            running = {"matchId": match_id, "videoKey": video_key, "status": "running"}
            self.on_channel(channel, lambda: publish(channel, running))
            log.info("job %s started", match_id)
            started = time.monotonic()
            result = self.runner.run(body)
            log.info("job %s done in %.1f s", match_id, time.monotonic() - started)
            self.on_channel(channel, lambda: self.finish(channel, tag, result))
        except PermanentJobError as error:
            if self.stopped_mid_job():
                return
            if error.code == "processing_timeout":
                log.error("job %s timed out: %s", match_id, error)
            else:
                log.error("job failed for good: %s %s", error.code, error)
            message = failed_message(body, error.code, str(error))
            self.on_channel(channel, lambda: self.finish(channel, tag, message))
        except Exception as error:  # transient: network, R2 or RabbitMQ hiccup, or the child died
            if self.stopped_mid_job():
                return
            if not channel.is_open:
                # run_forever killed the job after RabbitMQ took the delivery back: there is no
                # retry to queue on this channel
                log.warning("job %s stopped: the channel closed and RabbitMQ will deliver it again", match_id)
                return
            attempt = self.attempts(properties)
            if attempt >= MAX_ATTEMPTS:
                # Out of attempts: give up instead of looping forever
                log.exception("job failed on attempt %d of %d; giving up", attempt, MAX_ATTEMPTS)
                message = failed_message(body, "processing_failed", repr(error))
                self.on_channel(channel, lambda: self.finish(channel, tag, message))
            else:
                log.exception("job failed on attempt %d of %d; queued for another try", attempt, MAX_ATTEMPTS)
                self.on_channel(channel, lambda: self.retry(channel, tag, body, attempt + 1))

    def stopped_mid_job(self):
        """True when stop() killed the job: that is not a failed attempt, so nothing is reported or
        acked, and RabbitMQ delivers the message again."""
        if self._stopping.is_set():
            log.warning("job stopped with the worker; it will run again")
            return True
        return False

    def retry(self, channel, tag, body, attempt):
        """Queue the same request again with its attempt count, then ack the one that failed:
        if the worker dies in between, the job is simply run again."""
        channel.basic_publish(
            exchange="",
            routing_key=REQUEST_QUEUE,
            body=body,
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=pika.DeliveryMode.Persistent,
                headers={ATTEMPT_HEADER: attempt},
            ),
        )
        channel.basic_ack(tag)

    def finish(self, channel, tag, message):
        """Publish the result, then ack: if the worker dies in between, the job is redone."""
        publish(channel, message)
        channel.basic_ack(tag)

    def on_channel(self, channel, callback):
        """Run `callback` on the connection's own thread (pika is not thread safe), if the channel
        the message came on is still open. When the connection dropped mid-job, RabbitMQ has
        already put the message back in the queue, and acking it on a newer channel would close
        that channel; so the result is dropped and the job runs again."""
        connection = channel.connection

        def guarded():
            if channel.is_open:
                callback()
            else:
                log.warning("channel closed during the job; RabbitMQ will deliver it again")

        try:
            connection.add_callback_threadsafe(guarded)
        except Exception:  # the connection itself is already closed
            log.warning("connection closed during the job; RabbitMQ will deliver it again")


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("pika").setLevel(logging.WARNING)  # connection chatter, not job progress
    url = os.environ.get("RABBITMQ_URL")
    if not url:
        raise SystemExit("RABBITMQ_URL is required")

    # Each job builds its own client in its child process; reading the settings here fails fast
    R2Settings.from_env()
    mock_video = os.environ.get("CV_MOCK_VIDEO") or None
    if mock_video and not os.path.isfile(mock_video):
        raise SystemExit(f"CV_MOCK_VIDEO does not exist: {mock_video}")
    if mock_video:
        log.warning("MOCK MODE: every job runs on %s; results are NOT from the uploaded recording", mock_video)

    job_timeout_s = job_timeout_from_env(os.environ.get("CV_JOB_TIMEOUT_S"))

    # A restarted container keeps its filesystem: drop a marker and job files left by the previous run
    set_healthy(False)
    removed = remove_leftover_job_dirs()
    if removed:
        log.warning("removed %d job director%s left by a previous run", removed, "y" if removed == 1 else "ies")
    worker = Worker(url, ChildJobRunner(job_timeout_s, mock_video))
    # docker compose stop sends SIGTERM: stop consuming, and the current job's message stays
    # unacked, so RabbitMQ hands it to the next worker
    signal.signal(signal.SIGTERM, lambda *_: worker.stop())
    worker.run_forever()


if __name__ == "__main__":
    main()
