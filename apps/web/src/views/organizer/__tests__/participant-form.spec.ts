import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'
import { WEIGHT_CLASSES } from '@/utils/robot'
import {
  PARTICIPANT_MESSAGES,
  WEIGHT_CLASS_OPTIONS,
  describeSaveError,
  emptyParticipantValues,
  participantPreview,
  participantValuesFrom,
  toRobotInput,
  validateParticipantForm,
} from '../participant-form'

describe('validateParticipantForm', () => {
  it('requires every field, ignoring blank space', () => {
    expect(validateParticipantForm({ name: ' ', team: '', weightClass: '' })).toEqual({
      name: PARTICIPANT_MESSAGES.nameRequired,
      team: PARTICIPANT_MESSAGES.teamRequired,
      weightClass: PARTICIPANT_MESSAGES.weightClassRequired,
    })
  })

  it('accepts only the two weight classes', () => {
    expect(
      validateParticipantForm({ name: 'Titã', team: 'Equipe Volt', weightClass: '3 kg' }),
    ).toEqual({ weightClass: PARTICIPANT_MESSAGES.weightClassRequired })
  })

  it('accepts filled values', () => {
    expect(
      validateParticipantForm({ name: 'Titã', team: 'Equipe Volt', weightClass: 'antweight' }),
    ).toEqual({})
  })
})

describe('form values', () => {
  it('starts empty and copies only the editable fields of a robot', () => {
    const robot: Robot = {
      id: 'r1',
      championshipId: 'c1',
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'beetleweight',
      owner: 'A. Moraes',
      createdAt: '',
      modifiedAt: '',
    }

    expect(emptyParticipantValues()).toEqual({ name: '', team: '', weightClass: '' })
    expect(participantValuesFrom(robot)).toEqual({
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'beetleweight',
    })
  })

  it('offers the API weight classes, untranslated, in API order', () => {
    expect(WEIGHT_CLASS_OPTIONS.map((o) => o.value)).toEqual([...WEIGHT_CLASSES])
    expect(WEIGHT_CLASS_OPTIONS.every((o) => o.label === o.value)).toBe(true)
  })

  it('normalizes the payload like the API', () => {
    expect(
      toRobotInput({ name: '  Titã ', team: 'Equipe   Volt', weightClass: 'beetleweight' }),
    ).toEqual({
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'beetleweight',
    })
  })
})

describe('participantPreview', () => {
  it('shows what will be saved', () => {
    expect(
      participantPreview({ name: ' Titã ', team: 'Equipe Volt', weightClass: 'antweight' }),
    ).toEqual({
      robot: 'Titã',
      team: 'Equipe Volt',
      details: 'antweight',
    })
  })

  it('uses stand-ins while fields are empty', () => {
    expect(participantPreview(emptyParticipantValues())).toEqual({
      robot: 'Nome do robô',
      team: 'Equipe',
      details: undefined,
    })
  })
})

describe('describeSaveError', () => {
  const apiError = (status: number, ...details: string[]) =>
    new ApiError(status, details[0] ?? 'Error', details)

  it('maps a taken name to the name field', () => {
    expect(describeSaveError(apiError(409, 'robot_name_taken'))).toEqual({
      message: PARTICIPANT_MESSAGES.reviewFields,
      fields: { name: PARTICIPANT_MESSAGES.nameTaken },
    })
  })

  it('maps a locked weight class to its field', () => {
    expect(describeSaveError(apiError(409, 'robot_has_matches'))).toEqual({
      message: PARTICIPANT_MESSAGES.reviewFields,
      fields: { weightClass: PARTICIPANT_MESSAGES.weightClassLocked },
    })
  })

  it('maps class-validator messages by property', () => {
    expect(
      describeSaveError(
        apiError(
          400,
          'team should not be empty',
          'weightClass must be one of the following values: fairyweight, antweight, beetleweight, hobbyweight, featherweight, lightweight',
        ),
      ),
    ).toEqual({
      message: PARTICIPANT_MESSAGES.reviewFields,
      fields: {
        team: PARTICIPANT_MESSAGES.teamInvalid,
        weightClass: PARTICIPANT_MESSAGES.weightClassInvalid,
      },
    })
  })

  it('explains a championship or robot that no longer exists', () => {
    expect(describeSaveError(apiError(404, 'robot_not_found')).message).toBe(
      PARTICIPANT_MESSAGES.notFound,
    )
  })

  it('handles network and unknown failures', () => {
    expect(describeSaveError(new ApiError(0, 'Failed to fetch')).message).toBe(
      PARTICIPANT_MESSAGES.noConnection,
    )
    expect(describeSaveError(new Error('boom'))).toEqual({
      message: PARTICIPANT_MESSAGES.generic,
      fields: {},
    })
  })
})
