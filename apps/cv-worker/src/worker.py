"""CV worker: consumes analysis jobs from RabbitMQ, one at a time.

    analysis.requested  -> {"matchId", "videoKey"}         (published by the API)
    analysis.finished   <- {"matchId", "status": ...}      (consumed by the API)

For each job it publishes "running", then "done" or "failed", and acks the request only at the
end, so a worker that dies mid-job leaves the message in the queue for the next one.

Environment:
    RABBITMQ_URL     amqp://user:password@rabbitmq:5672/
    R2_*             see docs/recording-storage.md
    CV_MOCK_VIDEO    optional: process this file instead of the recording (see jobs.run_job)
"""
import json
import logging
import os
import signal
import threading
import time

import pika

from jobs import PermanentJobError, failed_message, parse_request, run_job
from object_storage import ObjectStorage, R2Settings

REQUEST_QUEUE = "analysis.requested"
RESULT_QUEUE = "analysis.finished"

log = logging.getLogger("cv-worker")


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


class Worker:
    def __init__(self, url, storage, mock_video=None):
        self.url = url
        self.storage = storage
        self.mock_video = mock_video
        self.connection = None
        self.channel = None

    def run_forever(self):
        """Connect (retrying while RabbitMQ starts) and consume until stopped."""
        while True:
            try:
                self.connection = pika.BlockingConnection(pika.URLParameters(self.url))
                self.channel = self.connection.channel()
                declare_queues(self.channel)
                # One job at a time: the next message only comes after this one is acked
                self.channel.basic_qos(prefetch_count=1)
                self.channel.basic_consume(queue=REQUEST_QUEUE, on_message_callback=self.on_message)
                log.info("waiting for jobs on %s (mock video: %s)", REQUEST_QUEUE, self.mock_video or "off")
                self.channel.start_consuming()
                return  # stop() was called
            except pika.exceptions.AMQPConnectionError as error:
                log.warning("RabbitMQ not reachable (%s); retrying in 5 s", error)
                time.sleep(5)

    def stop(self):
        if self.connection and self.connection.is_open:
            self.connection.add_callback_threadsafe(self.channel.stop_consuming)

    def on_message(self, channel, method, properties, body):
        # The pipeline takes minutes; running it here would block the connection's heartbeats
        # and RabbitMQ would drop the worker mid-job. It runs in a thread and hands the ack back.
        # The thread keeps the channel the message came on: a delivery tag is only valid there.
        threading.Thread(target=self.process, args=(channel, method, body), daemon=True).start()

    def process(self, channel, method, body):
        tag, redelivered = method.delivery_tag, method.redelivered
        try:
            match_id, _ = parse_request(body)
            self.on_channel(channel, lambda: publish(channel, {"matchId": match_id, "status": "running"}))
            log.info("job %s started", match_id)
            started = time.monotonic()
            result = run_job(body, self.storage, self.mock_video)
            log.info("job %s done in %.1f s", match_id, time.monotonic() - started)
            self.on_channel(channel, lambda: self.finish(channel, tag, result))
        except PermanentJobError as error:
            log.error("job failed for good: %s %s", error.code, error)
            message = failed_message(body, error.code, str(error))
            self.on_channel(channel, lambda: self.finish(channel, tag, message))
        except Exception as error:  # transient: network, R2 or RabbitMQ hiccup
            if redelivered:
                # Already retried once: give up instead of looping forever
                log.exception("job failed again after a retry")
                message = failed_message(body, "processing_failed", repr(error))
                self.on_channel(channel, lambda: self.finish(channel, tag, message))
            else:
                log.exception("job failed; back to the queue for one retry")
                self.on_channel(channel, lambda: channel.basic_nack(tag, requeue=True))

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

    storage = ObjectStorage.from_settings(R2Settings.from_env())
    mock_video = os.environ.get("CV_MOCK_VIDEO") or None
    if mock_video and not os.path.isfile(mock_video):
        raise SystemExit(f"CV_MOCK_VIDEO does not exist: {mock_video}")

    worker = Worker(url, storage, mock_video)
    # docker compose stop sends SIGTERM: stop consuming, and the current job's message stays
    # unacked, so RabbitMQ hands it to the next worker
    signal.signal(signal.SIGTERM, lambda *_: worker.stop())
    worker.run_forever()


if __name__ == "__main__":
    main()
