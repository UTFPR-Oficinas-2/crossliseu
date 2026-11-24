# Fight recording storage (Cloudflare R2)

How a fight recording gets from the operator's browser to Cloudflare R2, and how it is set up. The web side is [#20](https://github.com/UTFPR-Oficinas-2/crossliseu/issues/20); the bucket and the API routes are [#45](https://github.com/UTFPR-Oficinas-2/crossliseu/issues/45); processing the video afterwards is [#21](https://github.com/UTFPR-Oficinas-2/crossliseu/issues/21) and the [CV worker](cv-worker-pipeline.md).

Each section says whether it is **done**, **in progress** or **planned**. Update this document when a route, a key or a setting changes.

## Status

| Part | Where | Status |
| --- | --- | --- |
| Record in the browser | `apps/web` (#20) | Done |
| Upload with progress, retry and leave guard | `apps/web` (#20) | Done, not tested end to end |
| R2 bucket and CORS | Cloudflare (#45) | Done |
| R2 access key | Cloudflare dashboard (#45) | Done |
| `upload-url` and `complete` routes, `match_videos` table | `apps/api` (#45) | Done, not tested end to end |
| Start processing after the upload, store the result | `apps/api`, `apps/cv-worker` (#21) | Done, tested end to end with Docker Compose (mock video) |
| Show the analysis and heatmaps | `apps/api`, `apps/web` (#21) | Planned |

## Flow

The video never goes through the API. The API only hands out a short-lived permission and records the result; the bytes go straight from the browser to R2.

```text
 browser                              API                               R2
    │ 1. POST /matches/:id/recording/upload-url                          │
    │ ───────────────────────────────► │ checks the session and the match │
    │ ◄─────────────────────────────── │ signs a PUT URL for one file     │
    │    { url, key, expiresAt }       │                                  │
    │ 2. PUT <url>  (the video, ~90 MB)                                    │
    │ ────────────────────────────────────────────────────────────────────►│
    │ ◄──────────────────────────────────────────────────────────── 200    │
    │ 3. POST /matches/:id/recording/complete                              │
    │ ───────────────────────────────► │ stores the video as uploaded     │
    │                                  │ and sends the analysis job       │
```

| Step | From → to | Size |
| --- | --- | --- |
| 1. Ask for an upload URL | browser → API | a few hundred bytes |
| 2. Upload the video | browser → R2 | the whole file |
| 3. Confirm the upload | browser → API | a few hundred bytes |

Why straight to R2: the API runs on a small VPS, the host NGINX limits request bodies, and the file would otherwise travel twice (browser → VPS → R2). The R2 keys stay on the server; the browser only ever sees a URL that allows one `PUT` of one file for a few minutes.

## R2 setup

Done once, by whoever owns the Cloudflare account. The bucket and its CORS rule can be created in the dashboard or with Wrangler (`npx wrangler login`, then `npx wrangler r2 bucket create crossliseu-videos` and `npx wrangler r2 bucket cors set crossliseu-videos --file <rules.json>`); the access key can only be created in the dashboard. Wrangler keeps a `.wrangler/` cache in the repository root with the account id and the owner's e-mail; it is git-ignored.

### Bucket

| Setting | Value |
| --- | --- |
| Name | `crossliseu-videos` |
| Location | Automatic |
| Storage class | Standard |
| Public access | **Off**. Every read and write goes through a presigned URL |

### CORS

The browser uploads to R2 from the web app's origin, so the bucket must allow it. Without this rule the browser blocks step 2 and the upload fails with a network error, even though the URL is valid.

Bucket → **Settings** → **CORS Policy**:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://ediasv.dev"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `http://localhost:5173`: the Vite dev server.
- `https://ediasv.dev`: production (the app is served under `/crossliseu/`, but CORS only looks at the origin).
- `PUT` for the upload, `GET` for reading the file back later (signed read URLs).

### Access key

**R2 Object Storage** → **Manage API tokens** → **Create Account API token**. This is not the general token page under *My Profile → API Tokens*; those tokens are for the Cloudflare API, not for the S3-compatible R2 API.

| Setting | Value |
| --- | --- |
| Name | `crossliseu-api` |
| Permissions | Object Read & Write |
| Buckets | `crossliseu-videos` only |

The dashboard shows the **Access Key ID**, the **Secret Access Key** and the **S3 endpoint** once. They go into the server environment and nowhere else (see [Environment](#environment)).

## Environment

Read by `apps/api` to sign URLs (and later by the CV worker to download videos and upload results). Set in the root `.env`, which git ignores; production gets them from the server's `.env`. Never commit the values or paste them in issues, PRs or chats.

| Variable | Example | Notes |
| --- | --- | --- |
| `R2_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | S3 endpoint shown with the key |
| `R2_ACCESS_KEY_ID` | | From the access key |
| `R2_SECRET_ACCESS_KEY` | | From the access key; shown only once |
| `R2_BUCKET` | `crossliseu-videos` | |

The names (without values) are in `.env.example`. To get the values, ask the Cloudflare account owner in private (a direct message or a shared password manager), or ask for a key of your own: one token per developer can be revoked without affecting the others. To manage the bucket itself, ask to be invited under **Manage account → Members**.

## Object keys

| Key | Written by | Content |
| --- | --- | --- |
| `recordings/<matchId>/<uuid>.<ext>` | browser, with the presigned URL | The fight video; `<ext>` is `mp4` or `webm`. `<uuid>` is new on every upload attempt |
| `analyses/<matchId>/trajectories.csv` | CV worker | See [Storage](cv-worker-pipeline.md#7-storage) |
| `analyses/<matchId>/heatmap_robot<id>.png` | CV worker | See [Heatmap](cv-worker-pipeline.md#8-heatmap) |

One confirmed video per match. A new upload attempt gets a new key, so recording a match again never touches the confirmed video: the old object is deleted only after the new one is confirmed. An upload that is requested but never confirmed leaves an unreferenced object in R2; clean those with an R2 lifecycle rule (not set up yet).

## API routes

**Done** (#45), in `apps/api/src/modules/recordings/`. These are the routes `apps/web/src/api/recordings.ts` calls.

Both require the operator's JWT (`Authorization: Bearer <token>`) and only work for the owner of the match's championship; anyone else gets `404 match_not_found`, like the other match routes. Both answer `503 recording_storage_not_configured` while any `R2_*` variable is missing.

The video is stored in the `match_videos` table, one row per match:

| Column | Notes |
| --- | --- |
| `match_id` | Unique: recording a match again reuses the row (one `INSERT … ON CONFLICT`, so two requests at once cannot both insert) |
| `object_key` | `recordings/<matchId>/<uuid>.<ext>`: the confirmed video (the first attempt's key until it is confirmed) |
| `content_type` | `video/mp4` or `video/webm` |
| `status` | `uploading` (first upload not confirmed yet) or `uploaded` (confirmed and found in R2) |
| `pending_object_key`, `pending_content_type` | The latest URL handed out. `complete` accepts only this key and then moves it to `object_key` / `content_type` |
| `size_bytes` | Read from R2 on `complete`; `null` while uploading |
| `uploaded_at`, `uploaded_by_user_id` | When it was confirmed, and who asked for the URL |
| `analysis_status` | `pending`, `running`, `done` or `failed`; `null` until the first upload is confirmed. See [Analysis jobs](#analysis-jobs) |
| `analysis_error` | Error code when `failed`: `queue_unavailable` (set by the API) or the worker's (`recording_not_found`, `video_unreadable`, `processing_failed`, …) |
| `analysis_result` | `jsonb`: the worker's `done` message without `matchId` / `videoKey` / `status` (`mock`, `totalFrames`, `trajectoriesKey`, `robots`) |

### `POST /matches/:id/recording/upload-url`

Request:

```json
{ "contentType": "video/mp4", "size": 73400320 }
```

Response `200`:

```json
{
  "url": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com/crossliseu-videos/recordings/6f1c….mp4?X-Amz-…",
  "key": "recordings/6f1c….mp4",
  "expiresAt": "2026-11-10T17:15:00.000Z"
}
```

- The URL allows one `PUT` to `key`, for 15 minutes. `key` is new on every call; the confirmed video of the match stays readable until `complete` replaces it.
- `size` (bytes the browser is going to upload, at most 500 MB) is signed into the URL as `content-length`, so R2 refuses a `PUT` of any other size (`403`). The cap is `MAX_RECORDING_BYTES` in `recording.dto.ts`. **Not yet confirmed against a real bucket**: check that R2 enforces it.
- `contentType` is signed into the URL, so the `PUT` must send the same `Content-Type`; R2 answers `403` to any other. The browser always sends the plain type (`video/mp4` or `video/webm`, no `codecs=`). The AWS SDK leaves `Content-Type` out of the signature by default, so `R2RecordingStorage` passes `signableHeaders` to include it.
- `400` when `contentType` is not `video/mp4` or `video/webm`, or `size` is not an integer from 1 to 500 MB; `404 match_not_found`.

### `POST /matches/:id/recording/complete`

Request:

```json
{ "key": "recordings/6f1c….mp4", "size": 73400320 }
```

Response `204`. The API reads the object from R2 before accepting it, then stores the video as `uploaded` with R2's size, deletes the object it replaces and sends the [analysis job](#analysis-jobs). `size` has the same cap as in `upload-url`.

| Error | When |
| --- | --- |
| `409 recording_not_requested` | `key` is not the latest one handed out by `upload-url` for this match (or none was) |
| `409 recording_not_uploaded` | The object is not in R2 |
| `409 recording_size_mismatch` | R2 has a different size than `size`: the upload did not finish |
| `404 match_not_found` | Unknown match, or not the caller's |

### `GET /matches/:id/recording`

The uploaded video, with a presigned read URL made on each call (for the CV worker to download it, or the web app to play it). Response `200`:

```json
{
  "key": "recordings/6f1c….mp4",
  "contentType": "video/mp4",
  "sizeBytes": 426782,
  "uploadedAt": "2026-11-11T01:15:38.809Z",
  "url": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com/crossliseu-videos/recordings/6f1c….mp4?X-Amz-…",
  "expiresAt": "2026-11-11T01:43:08.750Z"
}
```

- The URL allows `GET` of that one object for 15 minutes; ask again for a new one.
- `404 recording_not_found` while there is no confirmed upload (none yet, or one still in progress); `404 match_not_found` for an unknown match or one that is not the caller's.

## Analysis jobs

**Done** (#21), in `apps/api/src/modules/analysis/` and `apps/api/src/modules/recordings/analysis-results.service.ts`. The API and the [CV worker](cv-worker-pipeline.md) talk through two durable RabbitMQ queues:

```text
 API ── analysis.requested {matchId, videoKey} ──► worker
 API ◄── analysis.finished {matchId, videoKey, status, …} ── worker   (running, then done | failed)
```

1. `complete` sets `analysis_status = pending` (clearing any earlier result: it described the old video) and publishes the job as a persistent message on a confirm channel. If RabbitMQ does not confirm within 5 s, the upload is still confirmed (`204`) and the analysis is stored as `failed` / `queue_unavailable`.
2. The worker downloads `videoKey`, runs the pipeline, uploads the results to `analyses/<matchId>/` and publishes `running`, then `done` or `failed`.
3. The API reads `analysis.finished` and applies each message with one `UPDATE` that also checks the video key and the previous state:

| Message | Applied when the analysis is | Sets |
| --- | --- | --- |
| `running` | `pending` | `running` |
| `done` | `pending` or `running` | `done`, `analysis_result` |
| `failed` | `pending` or `running` | `failed`, `analysis_error` |

So a result for a video that was since replaced by a re-record, a duplicate (a job redone after a worker crash) or a late message changes nothing (`analysis_result_ignored` in the log). A message that is not valid JSON, has an unknown status or no `videoKey` is dropped (`analysis_result_invalid`). A message acks only once stored; if storing fails it is requeued once, then dropped.

`RABBITMQ_URL` is optional for the API, like the `R2_*` variables: without it the API starts and every analysis ends `failed` / `queue_unavailable`. Compose builds it from `RABBITMQ_USER` and `RABBITMQ_PASSWORD` for both the API and the worker.

## Web app

**Done** (#20). The operator screen (`/operator/:matchId`) shows `FightRecorderPanel`; the same panel is on `/dev/components` (button *Abrir gravador*) for testing without signing in.

| File | Role |
| --- | --- |
| `src/utils/recording.ts` | Pure helpers: format choice, file name, timer and size formatting, camera error messages |
| `src/composables/useFightRecorder.ts` | Camera list, preview, `MediaRecorder`, joins the chunks into the video file |
| `src/api/recordings.ts` | Steps 1 and 3 (API calls) |
| `src/api/r2-upload.ts` | Step 2: `PUT` with `XMLHttpRequest` (the only browser API that reports upload progress); `UploadError.aborted` tells a cancel from a failure |
| `src/composables/useRecordingUpload.ts` | Runs the three steps, tracks the state and explains failures |
| `src/views/operator/components/FightRecorderPanel.vue` | The screen |

### Recording

- 1280×720 at 30 fps, no audio, about 4 Mbit/s: a 3-minute fight is about 90 MB.
- MP4 when Chrome supports it, WebM otherwise. One chunk per second; the chunks are joined into one file when recording stops.
- Today the operator starts and stops it with buttons. It will follow the fight's Start and end instead (planned).

### Upload states

```text
idle → requesting → uploading (0–100 %) → completing → done
                 └──────── any failure ────────→ error  (Tentar de novo runs all three steps again)
```

| Failure | Message to the operator |
| --- | --- |
| R2 answers `403` | The upload link expired or was refused. Retrying asks for a new URL, which fixes an expired one |
| Network drops during the upload | The connection dropped; check the internet and retry |
| API unreachable | No connection to the server |
| API answers `401` | The session expired; sign in again and resend |
| API answers `404` | The match was not found |

The video only exists in the tab's memory until it reaches R2. While a recording is running or not yet uploaded, closing the tab, reloading or leaving the screen asks for confirmation.

## Testing

| What | How |
| --- | --- |
| Web logic | `npx vitest run src/utils src/composables src/api` in `apps/web` (API and R2 are faked) |
| Recording without a camera | Start Chrome with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and open `/dev/components` |
| API logic | `npx vitest run src/modules/recordings` in `apps/api` (R2 and the database are faked) |
| Upload end to end | API running locally (Docker Compose, after `migration:run`), the R2 variables in `.env`, signed in on the operator screen |

## Open questions

- **Variable frame rate.** Browser recordings have uneven gaps between frames, so the CV worker must use each frame's own timestamp instead of `frame / fps`. Measured on a Chrome WebM; still to confirm on Chrome MP4. See the CV worker's open questions.
- **Lost tab.** A recording that was not uploaded is lost if the tab closes. The leave guard reduces the risk but does not remove it.
- **Retention.** How long videos stay in R2 is not decided (the free tier holds 10 GB, about 110 fights of 3 minutes).
- **Processing trigger.** #21 describes the worker asking the API for jobs; the team also discussed a RabbitMQ queue. To be decided before #21 starts.
