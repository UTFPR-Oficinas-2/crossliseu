"""Object storage (Cloudflare R2): download the fight video, upload the results.

R2 speaks the S3 API, so this uses boto3. Keys (docs/recording-storage.md):
    recordings/<matchId>.<ext>       input, written by the web app
    analyses/<matchId>/<file name>   output, written by this worker
"""
import os
from dataclasses import dataclass
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ENV_VARS = ("R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")

# Explicit: Windows guesses "application/vnd.ms-excel" for .csv
CONTENT_TYPES = {".csv": "text/csv", ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm"}


class ObjectNotFound(Exception):
    """The key does not exist in the bucket. Retrying will not help."""


@dataclass(frozen=True)
class R2Settings:
    endpoint_url: str
    access_key_id: str
    secret_access_key: str
    bucket: str

    @classmethod
    def from_env(cls, env=os.environ):
        missing = [name for name in ENV_VARS if not env.get(name)]
        if missing:
            raise RuntimeError(f"Missing environment variable(s): {', '.join(missing)}")
        return cls(env["R2_ENDPOINT_URL"], env["R2_ACCESS_KEY_ID"],
                   env["R2_SECRET_ACCESS_KEY"], env["R2_BUCKET"])


def analysis_key(match_id, file_name):
    """analyses/<matchId>/<file name>"""
    return f"analyses/{match_id}/{file_name}"


class ObjectStorage:
    def __init__(self, client, bucket):
        # The client is passed in so tests can hand in a fake S3 client
        self.client = client
        self.bucket = bucket

    @classmethod
    def from_settings(cls, settings):
        client = boto3.client(
            "s3",
            endpoint_url=settings.endpoint_url,
            aws_access_key_id=settings.access_key_id,
            aws_secret_access_key=settings.secret_access_key,
            region_name="auto",  # R2 has no regions
        )
        return cls(client, settings.bucket)

    def download(self, key, destination_dir):
        """Download one object into destination_dir; returns the local path."""
        destination_dir = Path(destination_dir)
        destination_dir.mkdir(parents=True, exist_ok=True)
        path = destination_dir / Path(key).name
        try:
            self.client.download_file(self.bucket, key, str(path))
        except ClientError as error:
            if error.response["Error"]["Code"] in ("404", "NoSuchKey"):
                raise ObjectNotFound(f"{key} not found in bucket {self.bucket}") from error
            raise
        return path

    def upload(self, path, key):
        path = Path(path)
        content_type = CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
        self.client.upload_file(str(path), self.bucket, key, ExtraArgs={"ContentType": content_type})
        return key

    def upload_analysis(self, match_id, paths):
        """Upload result files to analyses/<matchId>/; returns {file name: key}."""
        return {Path(p).name: self.upload(p, analysis_key(match_id, Path(p).name)) for p in paths}
