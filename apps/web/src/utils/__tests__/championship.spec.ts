import { describe, expect, it } from 'vitest'
import {
  championshipMeta,
  championshipStatusFromDates,
  championshipStatusPill,
  formatDateRange,
} from '../championship'

const now = new Date('2026-10-05T15:00:00.000Z')

describe('championshipStatusFromDates', () => {
  it('is scheduled when it starts after today', () => {
    expect(championshipStatusFromDates('2026-10-06', '2026-10-07', now)).toBe('scheduled')
  })
  it('is running from the start day through the end day, inclusive', () => {
    expect(championshipStatusFromDates('2026-10-05', '2026-10-05', now)).toBe('running')
    expect(championshipStatusFromDates('2026-10-01', '2026-10-05', now)).toBe('running')
    expect(championshipStatusFromDates('2026-10-05', '2026-10-09', now)).toBe('running')
  })
  it('is finished once the end day has passed', () => {
    expect(championshipStatusFromDates('2026-10-01', '2026-10-04', now)).toBe('finished')
  })
  it('accepts the API ISO timestamps', () => {
    expect(
      championshipStatusFromDates('2026-10-05T00:00:00.000Z', '2026-10-06T00:00:00.000Z', now),
    ).toBe('running')
  })
})

describe('championshipStatusPill', () => {
  it('maps each status to the Figma 06 label and tone', () => {
    expect(championshipStatusPill.running).toEqual({ label: 'Em andamento', tone: 'accent' })
    expect(championshipStatusPill.scheduled).toEqual({ label: 'Programado', tone: 'info' })
    expect(championshipStatusPill.finished).toEqual({ label: 'Encerrado', tone: 'neutral' })
  })
})

describe('formatDateRange', () => {
  it('shows a single day', () => {
    expect(formatDateRange('2026-12-09', '2026-12-09')).toBe('09 dez 2026')
    expect(formatDateRange('2026-12-09', null)).toBe('09 dez 2026')
    expect(formatDateRange('2026-12-09T00:00:00.000Z')).toBe('09 dez 2026')
  })
  it('collapses the month and year within one month', () => {
    expect(formatDateRange('2026-12-19', '2026-12-20')).toBe('19 – 20 dez 2026')
  })
  it('collapses the year across months', () => {
    expect(formatDateRange('2026-11-28', '2026-12-02')).toBe('28 nov – 02 dez 2026')
  })
  it('shows both years across years', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30 dez 2026 – 02 jan 2027')
  })
})

describe('championshipMeta', () => {
  it('joins date range, robots and fights', () => {
    expect(
      championshipMeta({
        startDate: '2025-12-10',
        endDate: '2025-12-10',
        robotCount: 16,
        fightsDone: 15,
        fightsTotal: 15,
      }),
    ).toBe('10 dez 2025 · 16 robôs · 15 de 15 lutas')
  })
  it('omits fights when there are none and uses singulars', () => {
    expect(
      championshipMeta({
        startDate: '2026-12-19',
        endDate: '2026-12-20',
        robotCount: 1,
        fightsDone: 0,
        fightsTotal: 0,
      }),
    ).toBe('19 – 20 dez 2026 · 1 robô')
    expect(
      championshipMeta({
        startDate: '2026-12-19',
        endDate: null,
        robotCount: 0,
        fightsDone: 0,
        fightsTotal: 1,
      }),
    ).toBe('19 dez 2026 · 0 robôs · 0 de 1 luta')
  })
  it('skips missing values instead of inventing them', () => {
    expect(championshipMeta({ startDate: null })).toBe('')
    expect(championshipMeta({ startDate: '2026-12-19', robotCount: 12 })).toBe(
      '19 dez 2026 · 12 robôs',
    )
  })
})
