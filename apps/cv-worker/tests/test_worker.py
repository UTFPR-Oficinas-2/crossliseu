"""Retry accounting and shutdown of the RabbitMQ worker.

Run from the repository root (needs pika; OpenCV and boto3 are not needed, the pipeline is faked):
    python -m unittest discover -s apps/cv-worker/tests
"""
import json
import logging
import os
import sys
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


def run_failing_job(headers=None, redelivered=False):
    """One delivery whose pipeline fails with a transient error; returns the fake channel."""
    channel = FakeChannel()
    method = SimpleNamespace(delivery_tag=7, redelivered=redelivered)
    properties = pika.BasicProperties(headers=headers)
    instance = worker.Worker("amqp://unused", storage=None)
    with mock.patch.object(worker, "run_job", side_effect=OSError("network blip")):
        instance.process(channel, method, properties, BODY)
    return channel


class RetryAccountingTest(unittest.TestCase):
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
        instance = worker.Worker("amqp://unused", storage=None)
        instance.stop()

        with mock.patch.object(worker.pika, "BlockingConnection") as connect, mock.patch.object(
            worker.time, "sleep", self.never_sleep
        ):
            instance.run_forever()

        connect.assert_not_called()

    def test_stop_while_connecting_does_not_start_consuming(self):
        instance = worker.Worker("amqp://unused", storage=None)
        consumer = mock.MagicMock()  # stands in for the connection and its channel

        def connect_then_sigterm(*_args, **_kwargs):
            instance.stop()  # SIGTERM lands while the connection is being opened
            return consumer

        with mock.patch.object(worker.pika, "BlockingConnection", side_effect=connect_then_sigterm):
            instance.run_forever()

        consumer.channel.return_value.start_consuming.assert_not_called()
        consumer.close.assert_called_once_with()

    def test_stop_while_waiting_to_reconnect_ends_run_forever(self):
        instance = worker.Worker("amqp://unused", storage=None)

        def unreachable(*_args, **_kwargs):
            instance.stop()  # SIGTERM arrives while RabbitMQ is still down
            raise pika.exceptions.AMQPConnectionError("down")

        with mock.patch.object(worker.pika, "BlockingConnection", side_effect=unreachable), mock.patch.object(
            worker.time, "sleep", self.never_sleep
        ):
            instance.run_forever()

    def test_health_file_exists_only_while_consuming(self):
        import tempfile

        with tempfile.TemporaryDirectory() as directory:
            marker = os.path.join(directory, "healthy")
            instance = worker.Worker("amqp://unused", storage=None)
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
            instance = worker.Worker("amqp://unused", storage=None)
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


if __name__ == "__main__":
    unittest.main()
