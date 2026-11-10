# Fight recording storage (Cloudflare R2)

How a fight recording gets from the operator's browser to Cloudflare R2, and how it is set up. The web side is [#20](https://github.com/UTFPR-Oficinas-2/crossliseu/issues/20); the bucket and the API routes are [#45](https://github.com/UTFPR-Oficinas-2/crossliseu/issues/45); processing the video afterwards is [#21](https://github.com/UTFPR-Oficinas-2/crossliseu/issues/21) and the [CV worker](cv-worker-pipeline.md).

Each section says whether it is **done**, **in progress** or **planned**. Update this document when a route, a key or a setting changes.

## Status

| Part | Where | Status |
| --- | --- | --- |
| Record in the browser | `apps/web` (#20) | Done |
| Upload with progress, retry and leave guard | `apps/web` (#20) | Done, not tested end to end |
| R2 bucket, CORS and access key | Cloudflare dashboard (#45) | In progress |
| `upload-url` and `complete` routes, `videos` table | `apps/api` (#45) | Planned |
| Start processing after the upload | `apps/api` (#21) | Planned |

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
    │                                  │ (later: creates the analysis job)│
```

| Step | From → to | Size |
| --- | --- | --- |
| 1. Ask for an upload URL | browser → API | a few hundred bytes |
| 2. Upload the video | browser → R2 | the whole file |
| 3. Confirm the upload | browser → API | a few hundred bytes |

Why straight to R2: the API runs on a small VPS, the host NGINX limits request bodies, and the file would otherwise travel twice (browser → VPS → R2). The R2 keys stay on the server; the browser only ever sees a URL that allows one `PUT` of one file for a few minutes.

## R2 setup

Done once, in the Cloudflare dashboard, by whoever owns the account.

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

The names (without values) go into `.env.example` together with the API code that reads them.

## Object keys

| Key | Written by | Content |
| --- | --- | --- |
| `recordings/<matchId>.<ext>` | browser, with the presigned URL | The fight video; `<ext>` is `mp4` or `webm` |
| `analyses/<matchId>/trajectories.csv` | CV worker | See [Storage](cv-worker-pipeline.md#7-storage) |
| `analyses/<matchId>/heatmap_robot<id>.png` | CV worker | See [Heatmap](cv-worker-pipeline.md#8-heatmap) |

One video per match: uploading again overwrites the same key.

## API routes

**Proposed.** These are the routes `apps/web/src/api/recordings.ts` calls today. They are not implemented yet (#45); if the API ends up different, that file is the only one to change on the web side.

Both require the operator's JWT (`Authorization: Bearer <token>`).

### `POST /matches/:id/recording/upload-url`

Request:

```json
{ "contentType": "video/mp4" }
```

Response `200`:

```json
{
  "url": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com/crossliseu-videos/recordings/6f1c….mp4?X-Amz-…",
  "key": "recordings/6f1c….mp4",
  "expiresAt": "2026-11-10T17:15:00.000Z"
}
```

- The URL allows one `PUT` to `key`, for about 15 minutes.
- `contentType` is signed into the URL, so the `PUT` must send the same `Content-Type`. The browser always sends the plain type (`video/mp4` or `video/webm`, no `codecs=`).
- `404` when the match does not exist.

### `POST /matches/:id/recording/complete`

Request:

```json
{ "key": "recordings/6f1c….mp4", "size": 73400320 }
```

Response `204`. Stores the video as `uploaded` (and, with #21, creates the analysis job). The API can check the object really exists in R2 before accepting it.

## Web app

**Done** (#20). The operator screen (`/operator/:matchId`) shows `FightRecorderPanel`; the same panel is on `/dev/components` (button *Abrir gravador*) for testing without signing in.

| File | Role |
| --- | --- |
| `src/utils/recording.ts` | Pure helpers: format choice, file name, timer and size formatting, camera error messages |
| `src/composables/useFightRecorder.ts` | Camera list, preview, `MediaRecorder`, joins the chunks into the video file |
| `src/api/recordings.ts` | Steps 1 and 3 (API calls) |
| `src/api/r2-upload.ts` | Step 2: `PUT` with `XMLHttpRequest` (the only browser API that reports upload progress) |
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
| Upload end to end | Needs the #45 routes running locally (Docker Compose) and the R2 variables in `.env` |

## Open questions

- **Variable frame rate.** Browser recordings have uneven gaps between frames, so the CV worker must use each frame's own timestamp instead of `frame / fps`. Measured on a Chrome WebM; still to confirm on Chrome MP4. See the CV worker's open questions.
- **Lost tab.** A recording that was not uploaded is lost if the tab closes. The leave guard reduces the risk but does not remove it.
- **Retention.** How long videos stay in R2 is not decided (the free tier holds 10 GB, about 110 fights of 3 minutes).
- **Processing trigger.** #21 describes the worker asking the API for jobs; the team also discussed a RabbitMQ queue. To be decided before #21 starts.
