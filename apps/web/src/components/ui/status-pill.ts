/**
 * Figma `Status / Pill` tones:
 * - neutral: encerrado, inactive or not-yet states
 * - accent (orange): em andamento
 * - info (blue): programado
 * - success (green): done, connected, encerrada (match)
 * - warning (amber): pausada, waiting for something
 * - danger (red): errors and disconnections only
 */
export type StatusTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
