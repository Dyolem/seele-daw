import {
  createAllProjectCommitsSubscription,
  type ModelRevision,
  type ProjectSession,
} from '@seele-daw/project-core'

import type { GestureAuthority } from '#internal/common/interaction/gesture-session'

/** A Project Session as the authority of a gesture computed against `baseRevision`. */
export function projectGestureAuthority(
  session: Pick<ProjectSession, 'modelRevision' | 'subscribe'>,
  baseRevision: ModelRevision,
): GestureAuthority {
  return {
    baseRevision,
    currentRevision: () => session.modelRevision,
    watch: (listener) => session.subscribe(createAllProjectCommitsSubscription(), listener),
  }
}
