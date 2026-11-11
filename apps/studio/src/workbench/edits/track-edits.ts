import {
  createAddInstrumentTrackCommand,
  createReplaceInstrumentDeviceCommand,
  parseBipolarValue,
  parseDeviceId,
  parseLinearGain,
  parseTrackId,
  type ProjectCommit,
  type TrackId,
} from '@seele-daw/project-core'
import { createSampleInstrumentDeviceDescriptor, type SoundbankId } from '@seele-daw/playback'

import {
  ProjectEditError,
  executeEdit,
  executeRequiredEdit,
  requireEditSession,
  staleEdit,
  type ProjectEditContext,
} from '@/workbench/edits/edit-session'
import { selectProjectTrackColor } from '@/workbench/track-palette'
import {
  DEFAULT_BUILT_IN_INSTRUMENT,
  findBuiltInInstrumentCatalogueEntry,
} from '@/workbench/instrument/built-in-instrument-catalogue'

export interface AddedTrack {
  readonly commit: ProjectCommit
  readonly trackId: TrackId
}

export function createTrackEdits(context: ProjectEditContext) {
  return {
    /** Appends a Studio Grand Instrument Track named after its position among the Tracks. */
    addInstrumentTrack(): AddedTrack {
      const session = requireEditSession(context)
      const snapshot = session.getSnapshot()
      const instrumentTrackCount = snapshot.tracks.length
      const lastTrack = snapshot.tracks.find(({ id }) => id === snapshot.trackOrder.at(-1))
      const color = selectProjectTrackColor(context.random(), lastTrack?.color ?? null)
      const trackId = parseTrackId(context.createId())
      const commit = executeRequiredEdit(
        session,
        createAddInstrumentTrackCommand({
          baseRevision: session.modelRevision,
          trackId,
          name: `Instrument ${instrumentTrackCount + 1}`,
          color,
          channel: {
            gain: parseLinearGain(1),
            pan: parseBipolarValue(0),
            muted: false,
            soloed: false,
          },
          instrumentDevice: createSampleInstrumentDeviceDescriptor(
            parseDeviceId(context.createId()),
            DEFAULT_BUILT_IN_INSTRUMENT.soundbankId,
          ),
          insertAt: snapshot.trackOrder.length,
        }),
      )
      return { commit, trackId }
    },

    /** Returns null when the Track already uses the requested instrument. */
    selectBuiltInInstrument(trackId: TrackId, soundbankId: SoundbankId): ProjectCommit | null {
      const session = requireEditSession(context)
      const instrument = findBuiltInInstrumentCatalogueEntry(soundbankId)
      if (instrument === null) {
        throw new ProjectEditError('unsupported', `${soundbankId} is not a built-in instrument.`)
      }
      const track = session.getSnapshot().tracks.find(({ id }) => id === trackId)
      if (track === undefined) throw staleEdit()
      return executeEdit(
        session,
        createReplaceInstrumentDeviceCommand({
          baseRevision: session.modelRevision,
          trackId: track.id,
          instrumentDevice: createSampleInstrumentDeviceDescriptor(
            track.instrumentDeviceId,
            instrument.soundbankId,
          ),
        }),
      )
    },
  }
}

export type TrackEdits = ReturnType<typeof createTrackEdits>
