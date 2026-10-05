import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  FORM_MESSAGES as M,
  describeSaveError,
  formValuesFrom,
  toChampionshipInput,
  validateChampionshipForm,
} from '../championship-form'

const valid = { name: 'Copa', startDate: '2026-12-09', endDate: '2026-12-10' }

describe('validateChampionshipForm', () => {
  it('accepts a valid form, including a single-day championship', () => {
    expect(validateChampionshipForm(valid)).toEqual({})
    expect(validateChampionshipForm({ ...valid, endDate: valid.startDate })).toEqual({})
  })
  it('requires every field; a blank name counts as empty', () => {
    expect(validateChampionshipForm({ name: '   ', startDate: '', endDate: '' })).toEqual({
      name: M.nameRequired,
      startDate: M.startRequired,
      endDate: M.endRequired,
    })
  })
  it('rejects an end before the start', () => {
    expect(validateChampionshipForm({ ...valid, endDate: '2026-12-08' })).toEqual({
      endDate: M.endBeforeStart,
    })
  })
})

describe('toChampionshipInput / formValuesFrom', () => {
  it('trims the name', () => {
    expect(toChampionshipInput({ ...valid, name: '  Copa  ' })).toEqual(valid)
  })
  it('reads API timestamps as date-input values and tolerates a missing end date', () => {
    expect(
      formValuesFrom({
        id: 'x',
        name: 'Copa',
        startDate: '2026-12-09T00:00:00.000Z',
        endDate: null,
        createdAt: '',
        modifiedAt: '',
      }),
    ).toEqual({ name: 'Copa', startDate: '2026-12-09', endDate: '' })
  })
})

describe('describeSaveError', () => {
  it('reports a missing connection', () => {
    expect(describeSaveError(new ApiError(0, 'Failed to fetch'))).toEqual({
      message: M.noConnection,
      fields: {},
    })
  })
  it('maps API 400 messages to fields', () => {
    expect(
      describeSaveError(
        new ApiError(400, 'championship_end_before_start', ['championship_end_before_start']),
      ),
    ).toEqual({
      message: M.reviewFields,
      fields: { endDate: M.endBeforeStart },
    })
    expect(
      describeSaveError(
        new ApiError(400, 'Bad Request', [
          'name should not be empty',
          'startDate must be a Date instance',
        ]),
      ),
    ).toEqual({
      message: M.reviewFields,
      fields: { name: M.nameInvalid, startDate: M.startInvalid },
    })
  })
  it('falls back to a generic message', () => {
    expect(
      describeSaveError(new ApiError(400, 'Bad Request', ['property x should not exist'])),
    ).toEqual({
      message: M.generic,
      fields: {},
    })
    expect(describeSaveError(new ApiError(500, 'boom'))).toEqual({
      message: M.generic,
      fields: {},
    })
    expect(describeSaveError(new Error('x'))).toEqual({ message: M.generic, fields: {} })
  })
})
