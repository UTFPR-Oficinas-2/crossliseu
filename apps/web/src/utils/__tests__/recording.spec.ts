import { describe, expect, it } from 'vitest'
import {
  describeCameraError,
  fileExtension,
  formatBytes,
  formatElapsed,
  pickMimeType,
  recordingFileName,
} from '../recording'

describe('pickMimeType', () => {
  it('prefers MP4 when the browser supports it', () => {
    expect(pickMimeType(() => true)).toBe('video/mp4;codecs=avc1')
  })

  it('falls back to WebM when MP4 is not supported', () => {
    const webmOnly = (type: string) => type.startsWith('video/webm')
    expect(pickMimeType(webmOnly)).toBe('video/webm;codecs=vp9')
  })

  it('returns null when no format is supported', () => {
    expect(pickMimeType(() => false)).toBeNull()
  })
})

describe('fileExtension and recordingFileName', () => {
  it('reads the extension from the type, codecs included', () => {
    expect(fileExtension('video/mp4;codecs=avc1')).toBe('mp4')
    expect(fileExtension('video/webm;codecs=vp8')).toBe('webm')
  })

  it('names the file after the match, like the R2 key', () => {
    expect(recordingFileName('6f1c2a9e', 'video/mp4')).toBe('6f1c2a9e.mp4')
    expect(recordingFileName('6f1c2a9e', 'video/webm;codecs=vp9')).toBe('6f1c2a9e.webm')
  })
})

describe('formatElapsed', () => {
  it('shows minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(125)).toBe('02:05')
    expect(formatElapsed(59.9)).toBe('00:59')
  })

  it('adds hours from one hour on', () => {
    expect(formatElapsed(3725)).toBe('1:02:05')
  })

  it('never shows a negative time', () => {
    expect(formatElapsed(-3)).toBe('00:00')
  })
})

describe('describeCameraError', () => {
  // getUserMedia rejects with a DOMException; its `name` is what matters
  const cameraError = (name: string) => Object.assign(new Error('camera'), { name })

  it('explains the common getUserMedia failures', () => {
    expect(describeCameraError(cameraError('NotAllowedError'))).toMatch(/Permissão/)
    expect(describeCameraError(cameraError('NotFoundError'))).toMatch(/Nenhuma câmera/)
    expect(describeCameraError(cameraError('NotReadableError'))).toMatch(/em uso/)
    expect(describeCameraError(cameraError('OverconstrainedError'))).toMatch(/outra câmera/)
  })

  it('falls back to a generic message', () => {
    expect(describeCameraError(cameraError('SomethingElse'))).toBe('Não foi possível abrir a câmera.')
    expect(describeCameraError('not an error')).toBe('Não foi possível abrir a câmera.')
  })
})

describe('formatBytes', () => {
  it('uses KB below one megabyte and MB from there on, with a comma', () => {
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(73_400_320)).toBe('70,0 MB')
  })
})
