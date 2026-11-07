import { describe, expect, it } from 'vitest'
import { ARENA_CONFIG_FILENAME, buildArenaConfig } from '@/utils/arena-config'

const credentials = {
  deviceId: 'arena-da-garagem-7f3a',
  token: 'ab12',
  serverUrl: 'wss://x/arena' as string | null,
}

describe('buildArenaConfig', () => {
  it('names the file config.h', () => {
    expect(ARENA_CONFIG_FILENAME).toBe('config.h')
  })

  it('fills the template and ends with a newline', () => {
    expect(buildArenaConfig('Arena da garagem', credentials)).toBe(
      [
        '// Gerado pelo Crossliseu para a arena "Arena da garagem". Não versione este arquivo.',
        '#define ARENA_SERVER_URL   "wss://x/arena"',
        '#define ARENA_DEVICE_ID    "arena-da-garagem-7f3a"',
        '#define ARENA_DEVICE_TOKEN "ab12"',
        '#define WIFI_SSID          "<sua rede>"',
        '#define WIFI_PASSWORD      "<sua senha>"',
        '',
      ].join('\n'),
    )
  })

  it('asks to fill in the server address when the API has none', () => {
    const config = buildArenaConfig('A', { ...credentials, serverUrl: null })

    expect(config).toContain('#define ARENA_SERVER_URL   "PREENCHA_O_ENDERECO_DO_SERVIDOR"\n')
  })

  it('escapes quotes and backslashes inside the C strings, not in the comment', () => {
    const config = buildArenaConfig('A "b" \\c', {
      deviceId: 'd"1',
      token: 't\\2',
      serverUrl: 'wss://x/"y"',
    })

    expect(config).toContain('para a arena "A "b" \\c". Não')
    expect(config).toContain('ARENA_SERVER_URL   "wss://x/\\"y\\""')
    expect(config).toContain('ARENA_DEVICE_ID    "d\\"1"')
    expect(config).toContain('ARENA_DEVICE_TOKEN "t\\\\2"')
  })
})
