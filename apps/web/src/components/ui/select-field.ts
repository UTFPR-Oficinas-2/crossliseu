// Types and keyboard helpers for SelectField (Figma `Select / Menu` 126:663, `Select / Option`
// 126:666)

export interface SelectOption {
  value: string
  label: string
  /** Muted text on the right, e.g. "Equipe Volt · Peso leve" */
  meta?: string
  disabled?: boolean
  /** Shown in place of `meta` while disabled, e.g. "Já escolhido como Robô 1" */
  disabledReason?: string
}

/** Next enabled index after `from` in `direction`; stays on `from` at either end (no wrap) */
export function stepEnabled(
  options: readonly SelectOption[],
  from: number,
  direction: 1 | -1,
): number {
  for (let index = from + direction; index >= 0 && index < options.length; index += direction) {
    if (!options[index]!.disabled) return index
  }
  return from
}

/** First (or last) enabled index, or -1 when every option is disabled */
export function firstEnabled(options: readonly SelectOption[], fromEnd = false): number {
  const index = fromEnd ? stepEnabled(options, options.length, -1) : stepEnabled(options, -1, 1)
  return index >= 0 && index < options.length ? index : -1
}
