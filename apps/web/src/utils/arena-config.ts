import type { DeviceCredentials } from '@/types'

export const ARENA_CONFIG_FILENAME = 'config.h'

/** Escapes a value for use inside a C string literal */
function cString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * The `config.h` for an arena's firmware, with the server address, device id and token filled
 * in. Wi-Fi stays as placeholders for the user to edit.
 */
export function buildArenaConfig(arenaName: string, c: DeviceCredentials): string {
  const serverUrl = c.serverUrl ?? 'PREENCHA_O_ENDERECO_DO_SERVIDOR'
  return [
    `// Gerado pelo Crossliseu para a arena "${arenaName}". Não versione este arquivo.`,
    `#define ARENA_SERVER_URL   "${cString(serverUrl)}"`,
    `#define ARENA_DEVICE_ID    "${cString(c.deviceId)}"`,
    `#define ARENA_DEVICE_TOKEN "${cString(c.token)}"`,
    '#define WIFI_SSID          "<sua rede>"',
    '#define WIFI_PASSWORD      "<sua senha>"',
    '',
  ].join('\n')
}
