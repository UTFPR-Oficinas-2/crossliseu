// Fight recording upload (#20), against `RecordingsController` in apps/api (#45). The video itself
// never goes through the API: these two calls only ask for permission and confirm the upload. The
// bytes go straight from the browser to R2 with `uploadToR2` (./r2-upload.ts).
import { apiRequest } from './client'

/** Answer of POST /matches/:id/recording/upload-url */
export interface ApiRecordingUploadUrl {
  /** Presigned R2 URL: allows one PUT of this one file, for a few minutes */
  url: string
  /** Object key in R2, e.g. "recordings/<matchId>.mp4" */
  key: string
  /** ISO timestamp after which `url` stops working */
  expiresAt: string
}

/** Body of POST /matches/:id/recording/complete */
export interface ApiRecordingComplete {
  key: string
  /** Bytes uploaded */
  size: number
}

/**
 * Step 1. POST /matches/:id/recording/upload-url (JWT). `contentType` is part of the signature,
 * so the PUT in step 2 must send the same Content-Type.
 */
export function requestUploadUrl(
  matchId: string,
  contentType: string,
  token: string,
): Promise<ApiRecordingUploadUrl> {
  return apiRequest(`/matches/${encodeURIComponent(matchId)}/recording/upload-url`, {
    method: 'POST',
    body: { contentType },
    token,
  })
}

/** Step 3. POST /matches/:id/recording/complete (JWT): the file is in R2 */
export function markUploaded(
  matchId: string,
  body: ApiRecordingComplete,
  token: string,
): Promise<void> {
  return apiRequest(`/matches/${encodeURIComponent(matchId)}/recording/complete`, {
    method: 'POST',
    body,
    token,
  })
}
