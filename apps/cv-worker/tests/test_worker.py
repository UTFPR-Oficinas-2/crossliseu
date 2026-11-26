"""Retry accounting and shutdown of the RabbitMQ worker.

Run from the repository root (needs pika; OpenCV and boto3 are not needed, the pipeline is faked):
    python -m unittest discover -s apps/cv-worker/tests
"""
import json
import logging
import os
import sys
import tempfile
import threading
import time
import types
import unittest
from types import SimpleNamespace
from unittest import mock

import pika
import pika.exceptions

# worker.py imports the pipeline (OpenCV) and R2 (boto3). These tests are about the worker's own
# logic, so those two modules are replaced by small fakes before it is imported.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class PermanentJobError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(detail)
        self.code = code


fake_jobs = types.ModuleType("jobs")
fake_jobs.PermanentJobError = PermanentJobError
fake_jobs.parse_request = lambda body: (json.loads(body)["matchId"], json.loads(body)["videoKey"])
fake_jobs.run_job = lambda body, storage, mock_video=None: {"status": "done"}
fake_jobs.failed_message = lambda body, code, detail: {
    "matchId": json.loads(body)["matchId"],
    "status": "failed",
    "code": code,
}
fake_storage = types.ModuleType("object_storage")
fake_storage.ObjectStorage = object
fake_storage.R2Settings = object
sys.modules["jobs"] = fake_jobs
sys.modules["object_storage"] = fake_storage

import worker  # noqa: E402  (after the fakes above)

def setUpModule():
    logging.disable(logging.CRITICAL)  # the failures below are on purpose; keep the output clean


def tearDownModule():
    logging.disable(logging.NOTSET)


BODY = json.dumps({"matchId": "m1", "videoKey": "recordings/m1.mp4"}).encode()


class FakeConnection:
    is_open = True

    def add_callback_threadsafe(self, callback):
        callback()  # the real one runs it on the connection's thread; here, right away


class FakeChannel:
    is_open = True

    def __init__(self):
        self.connection = FakeConnection()
        self.published = []  # (routing_key, decoded body, headers)
        self.acked = []
        self.nacked = []

    def basic_publish(self, exchange, routing_key, body, properties=None):
        headers = getattr(properties, "headers", None)
        self.published.append((routing_key, json.loads(body), headers))

    def basic_ack(self, tag):
        self.acked.append(tag)

    def basic_nack(self, tag, requeue=True):
        self.nacked.append((tag, requeue))

    def to(self, queue):
        return [(body, headers) for key, body, headers in self.published if key == queue]


class FakeRunner:
    """Stands in for ChildJobRunner: returns `result` or raises `error`, and counts kill() calls."""

    def __init__(self, result=None, error=None):
        self.result = result if result is not None else {"status": "done"}
        self.error = error
        self.kills = 0

    def run(self, body):
        if self.error:
            raise self.error
        return self.result

    def kill(self):
        self.kills += 1


def deliver(runner, headers=None, redelivered=False):
    """One delivery handled by a worker with `runner`; returns the fake channel."""
    channel = FakeChannel()
    method = SimpleNamespace(delivery_tag=7, redelivered=redelivered)
    properties = pika.BasicProperties(headers=headers)
    worker.Worker("amqp://unused", runner=runner).process(channel, method, properties, BODY)
    return channel


def run_failing_job(headers=None, redelivered=False):
    """One delivery whose pipeline fails with a transient error; returns the fake channel."""
    return deliver(FakeRunner(error=OSError("network blip")), headers, redelivered)


class RetryAccountingTest(unittest.TestCase):
    def test_running_message_names_the_video(self):
        # The API ignores results for a video the operator has since replaced
        channel = run_failing_job()

        results = [body for body, _ in channel.to(worker.RESULT_QUEUE)]
        self.assertEqual(results[0], {"matchId": "m1", "videoKey": "recordings/m1.mp4", "status": "running"})

    def test_first_transient_failure_republishes_with_attempt_2_and_acks(self):
        channel = run_failing_job()

        self.assertEqual(
            channel.to(worker.REQUEST_QUEUE),
            [({"matchId": "m1", "videoKey": "recordings/m1.mp4"}, {"x-attempt": 2})],
        )
        self.assertEqual(channel.acked, [7])
        self.assertEqual(channel.nacked, [])
        self.assertNotIn("failed", [body.get("status") for body, _ in channel.to(worker.RESULT_QUEUE)])

    def test_second_transient_failure_publishes_processing_failed(self):
        channel = run_failing_job(headers={"x-attempt": 2})

        self.assertEqual(channel.to(worker.REQUEST_QUEUE), [])
        results = [body for body, _ in channel.to(worker.RESULT_QUEUE)]
        self.assertIn({"matchId": "m1", "status": "failed", "code": "processing_failed"}, results)
        self.assertEqual(channel.acked, [7])

    def test_redelivered_flag_alone_does_not_exhaust_the_budget(self):
        # A crash or SIGTERM mid-job also sets `redelivered`: that is not a failed attempt
        channel = run_failing_job(redelivered=True)

        self.assertEqual(len(channel.to(worker.REQUEST_QUEUE)), 1)
        results = [body for body, _ in channel.to(worker.RESULT_QUEUE)]
        self.assertNotIn("failed", [body.get("status") for body in results])


class ShutdownTest(unittest.TestCase):
    @staticmethod
    def never_sleep(_seconds):
        raise AssertionError("the worker went back to sleep after being stopped")

    def test_stop_before_the_first_connection_ends_run_forever(self):
        instance = worker.Worker("amqp://unused", runner=FakeRunner())
        instance.stop()

        with mock.patch.object(worker.pika, "BlockingConnection") as connect, mock.patch.object(
            worker.time, "sleep", self.never_sleep
        ):
            instance.run_forever()

        connect.assert_not_called()

    def test_stop_while_connecting_does_not_start_consuming(self):
        instance = worker.Worker("amqp://unused", runner=FakeRunner())
        consumer = mock.MagicMock()  # stands in for the connection and its channel

        def connect_then_sigterm(*_args, **_kwargs):
            instance.stop()  # SIGTERM lands while the connection is being opened
            return consumer

        with mock.patch.object(worker.pika, "BlockingConnection", side_effect=connect_then_sigterm):
            instance.run_forever()

        consumer.channel.return_value.start_consuming.assert_not_called()
        consumer.close.assert_called_once_with()

    def test_stop_while_waiting_to_reconnect_ends_run_forever(self):
        instance = worker.Worker("amqp://unused", runner=FakeRunner())

        def unreachable(*_args, **_kwargs):
            instance.stop()  # SIGTERM arrives while RabbitMQ is still down
            raise pika.exceptions.AMQPConnectionError("down")

        with mock.patch.object(worker.pika, "BlockingConnection", side_effect=unreachable), mock.patch.object(
            worker.time, "sleep", self.never_sleep
        ):
            instance.run_forever()

    def test_channel_closed_by_broker_kills_the_job_and_reconnects(self):
        # RabbitMQ's consumer_timeout: a delivery unacked for 30 min closes the channel with 406.
        # The message is already back in the queue, so the job in hand must not keep running.
        runner = FakeRunner()
        instance = worker.Worker("amqp://unused", runner=runner)
        timed_out, healthy = mock.MagicMock(), mock.MagicMock()
        timed_out.channel.return_value.start_consuming.side_effect = pika.exceptions.ChannelClosedByBroker(
            406, "PRECONDITION_FAILED - delivery acknowledgement on channel 1 timed out"
        )
        healthy.channel.return_value.start_consuming.side_effect = instance.stop

        with mock.patch.object(worker.pika, "BlockingConnection", side_effect=[timed_out, healthy]) as connect:
            instance.run_forever()

        self.assertEqual(connect.call_count, 2)
        self.assertGreaterEqual(runner.kills, 1)
        timed_out.close.assert_called_once_with()

    def test_health_file_exists_only_while_consuming(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            marker = os.path.join(directory, "healthy")
            instance = worker.Worker("amqp://unused", runner=FakeRunner())
            seen = []
            connection = mock.MagicMock()
            connection.channel.return_value.start_consuming.side_effect = lambda: seen.append(os.path.exists(marker))

            with mock.patch.object(worker, "HEALTH_FILE", marker), mock.patch.object(
                worker.pika, "BlockingConnection", return_value=connection
            ):
                instance.run_forever()

            self.assertEqual(seen, [True])
            self.assertFalse(os.path.exists(marker))

    def test_health_file_is_removed_when_the_connection_drops(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            marker = os.path.join(directory, "healthy")
            instance = worker.Worker("amqp://unused", runner=FakeRunner())
            connection = mock.MagicMock()

            def drop():
                instance.stop()
                raise pika.exceptions.AMQPConnectionError("lost")

            connection.channel.return_value.start_consuming.side_effect = drop

            with mock.patch.object(worker, "HEALTH_FILE", marker), mock.patch.object(
                worker.pika, "BlockingConnection", return_value=connection
            ):
                instance.run_forever()

            self.assertFalse(os.path.exists(marker))


# Child targets for ChildJobRunner: module level, so the `spawn` start method can pickle them.
# Each one takes what worker.child_main takes: (conn, body, mock_video, workdir).
def target_done(conn, body, mock_video, workdir):
    conn.send(("done", {"status": "done"}))


def target_permanent(conn, body, mock_video, workdir):
    conn.send(("permanent", "video_unreadable", "x"))


def target_exits(conn, body, mock_video, workdir):
    os._exit(1)  # dies like an OOM kill or a segfault: nothing on the pipe


def target_sleeps(conn, body, mock_video, workdir):
    time.sleep(60)


def target_writes_then_sleeps(conn, body, mock_video, workdir):
    with open(os.path.join(workdir, "partial.bin"), "wb") as partial:
        partial.write(b"frames")
    # Tell the test where the directory is, without sending a result
    with open(os.environ["CV_TEST_WORKDIR_NOTE"], "w") as note:
        note.write(workdir)
    time.sleep(60)


class ChildJobRunnerTest(unittest.TestCase):
    def test_returns_the_childs_result(self):
        self.assertEqual(worker.ChildJobRunner(10, target=target_done).run(BODY), {"status": "done"})

    def test_past_the_limit_kills_the_child_and_raises_processing_timeout(self):
        runner = worker.ChildJobRunner(1, target=target_sleeps)
        started = time.monotonic()

        with self.assertRaises(PermanentJobError) as caught:
            runner.run(BODY)

        self.assertEqual(caught.exception.code, "processing_timeout")
        self.assertLess(time.monotonic() - started, 10)
        self.assertIsNone(runner._child)  # reaped: nothing left running

    def test_a_permanent_error_in_the_child_keeps_its_code(self):
        with self.assertRaises(PermanentJobError) as caught:
            worker.ChildJobRunner(10, target=target_permanent).run(BODY)

        self.assertEqual(caught.exception.code, "video_unreadable")

    def test_a_child_that_exits_without_a_result_is_transient(self):
        started = time.monotonic()

        with self.assertRaises(RuntimeError):
            worker.ChildJobRunner(30, target=target_exits).run(BODY)

        self.assertLess(time.monotonic() - started, 10)  # did not wait for the limit

    def test_the_workdir_is_removed_after_a_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            note = os.path.join(directory, "workdir")
            with mock.patch.dict(os.environ, {"CV_TEST_WORKDIR_NOTE": note}):
                with self.assertRaises(PermanentJobError):
                    worker.ChildJobRunner(3, target=target_writes_then_sleeps).run(BODY)

            with open(note) as written:
                workdir = written.read()
            self.assertFalse(os.path.exists(workdir))

    def test_kill_stops_a_running_child(self):
        runner = worker.ChildJobRunner(60, target=target_sleeps)
        raised = []

        def run():
            try:
                runner.run(BODY)
            except Exception as error:  # noqa: BLE001  (the test checks what was raised)
                raised.append(error)

        thread = threading.Thread(target=run)
        thread.start()
        deadline = time.monotonic() + 10
        while runner._child is None and time.monotonic() < deadline:
            time.sleep(0.05)
        runner.kill()
        thread.join(10)

        self.assertFalse(thread.is_alive())
        self.assertEqual(len(raised), 1)
        self.assertNotIsInstance(raised[0], PermanentJobError)  # a stopped job runs again

    def test_kill_when_idle_does_nothing(self):
        worker.ChildJobRunner(10, target=target_done).kill()


class TimeoutPathTest(unittest.TestCase):
    def test_a_timed_out_job_publishes_processing_timeout_acks_and_is_not_retried(self):
        channel = deliver(FakeRunner(error=PermanentJobError("processing_timeout", "ran past 1200 s")))

        results = [body for body, _ in channel.to(worker.RESULT_QUEUE)]
        self.assertIn({"matchId": "m1", "status": "failed", "code": "processing_timeout"}, results)
        self.assertEqual(channel.acked, [7])
        self.assertEqual(channel.to(worker.REQUEST_QUEUE), [])

    def test_a_job_that_finishes_publishes_its_result(self):
        channel = deliver(FakeRunner(result={"matchId": "m1", "status": "done"}))

        self.assertIn({"matchId": "m1", "status": "done"}, [body for body, _ in channel.to(worker.RESULT_QUEUE)])
        self.assertEqual(channel.acked, [7])

    def test_a_job_killed_by_stop_is_left_unacked_for_redelivery(self):
        # SIGTERM kills the child; the failure that follows is not a failed attempt
        instance = worker.Worker("amqp://unused", runner=FakeRunner(error=RuntimeError("killed")))
        instance.stop()
        channel = FakeChannel()

        instance.process(channel, SimpleNamespace(delivery_tag=7, redelivered=False), pika.BasicProperties(), BODY)

        self.assertEqual(channel.acked, [])
        self.assertEqual(channel.to(worker.REQUEST_QUEUE), [])
        self.assertNotIn("failed", [body.get("status") for body, _ in channel.to(worker.RESULT_QUEUE)])

    def test_stop_kills_the_running_job(self):
        runner = FakeRunner()
        worker.Worker("amqp://unused", runner=runner).stop()

        self.assertEqual(runner.kills, 1)


if __name__ == "__main__":
    unittest.main()
