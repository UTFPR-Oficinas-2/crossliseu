// Step 2 of the recording upload (#20): send the video straight to R2 with the presigned URL
// from `requestUploadUrl`. XMLHttpRequest instead of fetch because only XHR reports upload
// progress (`xhr.upload.onprogress`).

export class UploadError extends Error {
  /** HTTP status from R2, or `0` when the request never got a response (network, CORS, abort) */
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'UploadError'
    this.status = status
  }
}

export interface UploadOptions {
  /** Called with 0..1 while the bytes go out */
  onProgress?: (fraction: number) => void
  /** Aborting it cancels the upload */
  signal?: AbortSignal
}

/**
 * PUT the file to the presigned URL. The Content-Type must be the one used to sign the URL
 * (`file.type`), or R2 answers 403. Resolves when R2 has the whole file.
 */
export function uploadToR2(url: string, file: Blob, options: UploadOptions = {}): Promise<void> {
  const { onProgress, signal } = options

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError(0, 'Envio cancelado.'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve()
      } else {
        // 403 is almost always an expired URL or a Content-Type that differs from the signed one
        reject(new UploadError(xhr.status, `O R2 recusou o envio (HTTP ${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new UploadError(0, 'Falha de rede durante o envio.'))
    xhr.onabort = () => reject(new UploadError(0, 'Envio cancelado.'))

    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(file)
  })
}
