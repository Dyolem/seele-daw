import {
  createPianoRollDomNoteRenderer,
  type PianoRollNoteRendererFactory,
} from '@seele-daw/editor'

/**
 * Product policy chooses the initial Note adapter in one place. The Surface,
 * Scene, Tool and Project boundaries do not depend on this DOM implementation.
 */
export const createProjectPianoRollNoteRenderer: PianoRollNoteRendererFactory =
  createPianoRollDomNoteRenderer
