import { describe, expect, it, vi } from 'vitest'
import {
  createProjectFileDTO,
  createProjectSessionFromProjectFile,
  parseProjectColor,
  type ProjectFileDTO,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  createProjectMidiImportDraft,
  type ProjectMidiImportDiagnosticCode,
  type ProjectMidiTrackColorFactory,
} from '#internal/index'
import {
  createDeterministicImportId,
  createImportInput,
  createMidiDocument,
  createMidiNote,
  createMidiTrack,
  createTestInstrumentDevice,
} from '#internal/__tests__/support/project-midi-import-test-support'

function projectFileFor(input: Parameters<typeof createProjectMidiImportDraft>[0]): ProjectFileDTO {
  return createProjectFileDTO(createProjectMidiImportDraft(input).session.getSnapshot())
}

function findDiagnostic(
  draft: ReturnType<typeof createProjectMidiImportDraft>,
  code: ProjectMidiImportDiagnosticCode,
) {
  return draft.diagnostics.find((diagnostic) => diagnostic.code === code)
}

describe('createProjectMidiImportDraft', () => {
  it('maps global ticks into one Track, Clip, Source, and validated fresh Session', () => {
    const document = createMidiDocument({
      name: 'Source Name',
      ppq: 480,
      tempos: [{ tick: 0, bpm: 96 }],
      timeSignatures: [{ tick: 0, numerator: 3, denominator: 4 }],
      tracks: [
        createMidiTrack({
          name: 'Lead',
          channel: 2,
          endTick: 1920,
          notes: [
            createMidiNote({ tick: 480, durationTicks: 240, pitch: 64, velocity: 90 }),
            createMidiNote({ tick: 960, durationTicks: 480, pitch: 67, velocity: 110 }),
          ],
        }),
      ],
    })
    const createInstrumentDevice = vi.fn<typeof createTestInstrumentDevice>(
      createTestInstrumentDevice,
    )
    const createTrackColor = vi.fn<ProjectMidiTrackColorFactory>(() => parseProjectColor('#23B26D'))
    const draft = createProjectMidiImportDraft(
      createImportInput(document, {
        projectName: 'Imported Lead',
        createInstrumentDevice,
        createTrackColor,
      }),
    )
    const projectFile = createProjectFileDTO(draft.session.getSnapshot())

    expect(draft.summary).toEqual({
      sourceFormat: 1,
      sourcePpq: 480,
      sourceTrackCount: 1,
      importedTrackCount: 1,
      importedNoteCount: 2,
    })
    expect(draft.diagnostics).toEqual([])
    expect(draft.session.modelRevision).toBe(0)
    expect(draft.session.canUndo).toBe(false)
    expect(draft.session.canRedo).toBe(false)
    expect(projectFile.name).toBe('Imported Lead')
    expect(projectFile.trackOrder).toEqual(['track-0'])
    expect(projectFile.tracks['track-0']).toMatchObject({
      kind: 'instrument',
      name: 'Lead',
      color: '#23B26D',
      instrumentDeviceId: 'device-0',
    })
    expect(projectFile.clips['clip-0']).toMatchObject({
      trackId: 'track-0',
      startTick: 960,
      spanTick: 2880,
      sourceId: 'midi-source-0',
      loop: null,
      color: null,
    })
    expect(projectFile.midiSources['midi-source-0']).toEqual({
      id: 'midi-source-0',
      lengthTick: 2880,
      notes: {
        'midi-note-0': {
          id: 'midi-note-0',
          startTick: 0,
          durationTick: 480,
          pitch: 64,
          velocity: 90,
          channel: 2,
        },
        'midi-note-1': {
          id: 'midi-note-1',
          startTick: 960,
          durationTick: 960,
          pitch: 67,
          velocity: 110,
          channel: 2,
        },
      },
      sustainPedalEvents: {},
    })
    expect(projectFile.tempoEvents['tempo-event-0']).toMatchObject({ tick: 0, bpm: 96 })
    expect(projectFile.timeSignatureEvents['time-signature-event-0']).toMatchObject({
      tick: 0,
      numerator: 3,
      denominator: 4,
    })
    expect(projectFile.devices['device-0']).toMatchObject({
      typeId: 'test.default-instrument',
      opaqueState: { presetId: 'test-default' },
    })
    expect(createInstrumentDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'device-0',
        sourceTrack: document.tracks[0],
        sourceTrackIndex: 0,
        importedTrackIndex: 0,
      }),
    )
    expect(createTrackColor).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTrack: document.tracks[0],
        sourceTrackIndex: 0,
        importedTrackIndex: 0,
      }),
    )
    expect(() => createProjectSessionFromProjectFile(projectFile)).not.toThrow()
  })

  it('skips empty conductor tracks and supplies tick-zero timeline defaults', () => {
    const createInstrumentDevice = vi.fn<typeof createTestInstrumentDevice>(
      createTestInstrumentDevice,
    )
    const draft = createProjectMidiImportDraft(
      createImportInput(
        createMidiDocument({
          name: 'Conductor Only',
          tempos: [],
          timeSignatures: [],
          tracks: [createMidiTrack({ name: 'Conductor', notes: [] })],
        }),
        { createInstrumentDevice },
      ),
    )
    const projectFile = createProjectFileDTO(draft.session.getSnapshot())

    expect(draft.summary.importedTrackCount).toBe(0)
    expect(projectFile.trackOrder).toEqual([])
    expect(projectFile.tempoEvents['tempo-event-0']).toMatchObject({ tick: 0, bpm: 120 })
    expect(projectFile.timeSignatureEvents['time-signature-event-0']).toMatchObject({
      tick: 0,
      numerator: 4,
      denominator: 4,
    })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.EMPTY_TRACK_SKIPPED),
    ).toMatchObject({ sourceTrackIndex: 0 })
    expect(createInstrumentDevice).not.toHaveBeenCalled()
  })

  it('preserves low fractional and multiple Tempo Events within the Project range', () => {
    const projectFile = projectFileFor(
      createImportInput(
        createMidiDocument({
          tempos: [
            { tick: 0, bpm: 15.545455040082661 },
            { tick: 480, bpm: 120.5 },
            { tick: 960, bpm: 999 },
          ],
        }),
      ),
    )

    expect(Object.values(projectFile.tempoEvents)).toEqual([
      expect.objectContaining({ tick: 0, bpm: 15.545455040082661 }),
      expect.objectContaining({ tick: 960, bpm: 120.5 }),
      expect.objectContaining({ tick: 1_920, bpm: 999 }),
    ])
  })

  it('rounds absolute endpoints, expands zero-tick notes, and collapses timeline collisions', () => {
    const draft = createProjectMidiImportDraft(
      createImportInput(
        createMidiDocument({
          ppq: 1920,
          tempos: [
            { tick: 1, bpm: 110 },
            { tick: 2, bpm: 130 },
          ],
          timeSignatures: [
            { tick: 1, numerator: 3, denominator: 4 },
            { tick: 2, numerator: 7, denominator: 8 },
          ],
          tracks: [
            createMidiTrack({
              endTick: 2,
              notes: [createMidiNote({ tick: 1, durationTicks: 0 })],
            }),
          ],
        }),
      ),
    )
    const projectFile = createProjectFileDTO(draft.session.getSnapshot())

    expect(Object.values(projectFile.tempoEvents)).toEqual([
      expect.objectContaining({ tick: 0, bpm: 120 }),
      expect.objectContaining({ tick: 1, bpm: 130 }),
    ])
    expect(Object.values(projectFile.timeSignatureEvents)).toEqual([
      expect.objectContaining({ tick: 0, numerator: 4, denominator: 4 }),
      expect.objectContaining({ tick: 1, numerator: 7, denominator: 8 }),
    ])
    expect(projectFile.clips['clip-0']).toMatchObject({ startTick: 1, spanTick: 1 })
    expect(projectFile.midiSources['midi-source-0']?.notes['midi-note-0']).toMatchObject({
      startTick: 0,
      durationTick: 1,
    })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_COLLAPSED),
    ).toMatchObject({ eventCount: 2, projectTick: 1 })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TIME_SIGNATURE_EVENTS_COLLAPSED),
    ).toMatchObject({ eventCount: 2, projectTick: 1 })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.NOTE_DURATIONS_EXPANDED),
    ).toMatchObject({ eventCount: 1, sourceTrackIndex: 0 })
  })

  it('reports every represented-but-unsupported source fact without changing note length', () => {
    const draft = createProjectMidiImportDraft(
      createImportInput(
        createMidiDocument({
          keySignatures: [{ tick: 0, key: 'C', scale: 'major' }],
          textEvents: [{ tick: 0, kind: 'marker', text: 'Verse' }],
          tracks: [
            createMidiTrack({
              name: 'Strings',
              programNumber: 40,
              notes: [createMidiNote({ durationTicks: 240, releaseVelocity: 64 })],
              controlChanges: [
                { tick: 0, controller: 64, value: 127 },
                { tick: 10, controller: 1, value: 20 },
                { tick: 20, controller: 7, value: 100 },
              ],
              pitchBends: [{ tick: 30, value: 2048 }],
            }),
          ],
        }),
      ),
    )
    const projectFile = createProjectFileDTO(draft.session.getSnapshot())

    expect(projectFile.midiSources['midi-source-0']?.notes['midi-note-0']?.durationTick).toBe(480)
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.SUSTAIN_PEDAL_NOT_IMPORTED),
    ).toMatchObject({ eventCount: 1, controllerNumbers: [64] })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.CONTROL_CHANGES_NOT_IMPORTED),
    ).toMatchObject({ eventCount: 2, controllerNumbers: [1, 7] })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PITCH_BENDS_NOT_IMPORTED),
    ).toBeDefined()
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_NOT_APPLIED),
    ).toMatchObject({ sourceProgramNumber: 40 })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.RELEASE_VELOCITIES_NOT_IMPORTED),
    ).toMatchObject({ eventCount: 1 })
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.KEY_SIGNATURES_NOT_IMPORTED),
    ).toBeDefined()
    expect(
      findDiagnostic(draft, PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEXT_EVENTS_NOT_IMPORTED),
    ).toBeDefined()
    expect(Object.isFrozen(draft.diagnostics)).toBe(true)
    expect(Object.isFrozen(draft.diagnostics[0])).toBe(true)
  })

  it('disambiguates normalized tracks that share a source name', () => {
    const projectFile = projectFileFor(
      createImportInput(
        createMidiDocument({
          tracks: [
            createMidiTrack({ name: ' Piano ', channel: 0, programNumber: 0 }),
            createMidiTrack({ name: ' Piano ', channel: 1, programNumber: 40 }),
          ],
        }),
      ),
    )

    expect(projectFile.tracks['track-0']?.name).toBe('Piano · Ch 1 · Program 1')
    expect(projectFile.tracks['track-1']?.name).toBe('Piano · Ch 2 · Program 41')
  })

  it('passes stable per-kind ordinals and source locations to the ID factory', () => {
    const requests: Parameters<typeof createDeterministicImportId>[0][] = []
    createProjectMidiImportDraft(
      createImportInput(
        createMidiDocument({
          tracks: [
            createMidiTrack({
              notes: [createMidiNote({ tick: 480 }), createMidiNote({ tick: 0 })],
            }),
          ],
        }),
        {
          createId: (request) => {
            requests.push(request)
            return createDeterministicImportId(request)
          },
        },
      ),
    )

    expect(requests.filter(({ kind }) => kind === 'midi-note')).toEqual([
      expect.objectContaining({ kind: 'midi-note', ordinal: 0, sourceNoteIndex: 1 }),
      expect.objectContaining({ kind: 'midi-note', ordinal: 1, sourceNoteIndex: 0 }),
    ])
  })

  it('safely accepts opaque IDs that are special JavaScript property names', () => {
    const idByKind: Readonly<Record<string, string>> = {
      project: 'project',
      track: '__proto__',
      device: 'hasOwnProperty',
      clip: 'constructor',
      'midi-source': 'toString',
      'midi-note': 'valueOf',
      'tempo-event': 'tempo',
      'time-signature-event': 'meter',
    }
    const draft = createProjectMidiImportDraft(
      createImportInput(createMidiDocument(), {
        createId: ({ kind }) => idByKind[kind]!,
      }),
    )

    expect(draft.session.getSnapshot().trackOrder).toEqual(['__proto__'])
    expect(draft.session.getSnapshot().clips[0]?.id).toBe('constructor')
  })
})
