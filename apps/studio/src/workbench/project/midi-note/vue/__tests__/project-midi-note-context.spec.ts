import {
  parseClipId,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseNoteId,
  parsePositiveTick,
  parseTick,
  parseTickDelta,
  type ModelRevision,
} from '@seele-daw/project-core'
import { createApp } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectMidiNoteCoordinator } from '@/workbench/project/midi-note/project-midi-note-coordinator'
import {
  PROJECT_MIDI_NOTE_CONTEXT_KEY,
  useProjectMidiNotes,
  type ProjectMidiNoteVueContext,
} from '@/workbench/project/midi-note/vue/project-midi-note-context'
import { ProjectMidiNoteVueError } from '@/workbench/project/midi-note/vue/project-midi-note-vue-error'

describe('ProjectMidiNoteVueContext', () => {
  it('resolves the provided Coordinator and fails clearly without composition', () => {
    const addMidiNote = vi.fn<ProjectMidiNoteCoordinator['addMidiNote']>()
    const moveMidiNotes = vi.fn<ProjectMidiNoteCoordinator['moveMidiNotes']>()
    const removeMidiNotes =
      vi.fn<ProjectMidiNoteCoordinator['removeMidiNotes']>()
    const resizeMidiNote =
      vi.fn<ProjectMidiNoteCoordinator['resizeMidiNote']>()
    const context: ProjectMidiNoteVueContext = Object.freeze({
      projectMidiNotes: Object.freeze({
        addMidiNote,
        moveMidiNotes,
        removeMidiNotes,
        resizeMidiNote,
      }),
    })
    const providedApp = createApp({ render: () => null })
    const missingApp = createApp({ render: () => null })

    providedApp.provide(PROJECT_MIDI_NOTE_CONTEXT_KEY, context)

    expect(providedApp.runWithContext(() => useProjectMidiNotes())).toBe(context)
    expect(() => missingApp.runWithContext(() => useProjectMidiNotes())).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteVueError>>({
        name: 'ProjectMidiNoteVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useProjectMidiNotes())).toThrow(
      ProjectMidiNoteVueError,
    )

    providedApp.runWithContext(() =>
      useProjectMidiNotes().projectMidiNotes.addMidiNote({
        clipId: parseClipId('context-midi-note-clip'),
        clipStartTick: parseTick(0),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    )
    expect(addMidiNote).toHaveBeenCalledOnce()

    providedApp.runWithContext(() =>
      useProjectMidiNotes().projectMidiNotes.moveMidiNotes({
        baseRevision: 0 as ModelRevision,
        clipId: parseClipId('context-midi-note-clip'),
        deltaPitch: parseMidiPitchDelta(1),
        deltaTick: parseTickDelta(240),
        noteIds: [parseNoteId('context-midi-note')],
      }),
    )
    expect(moveMidiNotes).toHaveBeenCalledOnce()

    providedApp.runWithContext(() =>
      useProjectMidiNotes().projectMidiNotes.removeMidiNotes({
        clipId: parseClipId('context-midi-note-clip'),
        noteIds: [parseNoteId('context-midi-note')],
      }),
    )
    expect(removeMidiNotes).toHaveBeenCalledOnce()

    providedApp.runWithContext(() =>
      useProjectMidiNotes().projectMidiNotes.resizeMidiNote({
        baseRevision: 0 as ModelRevision,
        clipId: parseClipId('context-midi-note-clip'),
        durationTick: parsePositiveTick(480),
        noteId: parseNoteId('context-midi-note'),
        sourceStartTick: parseTick(240),
      }),
    )
    expect(resizeMidiNote).toHaveBeenCalledOnce()
  })
})
