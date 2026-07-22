import {
  createInitialProjectSession,
  parseTempoEventId,
  parseTimeSignatureEventId,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'

export const MINIMAL_NEW_PROJECT_NAME = 'Untitled Project'

export interface CreateMinimalNewProjectSessionInput {
  readonly projectId: ProjectId
  readonly createUniqueId: () => string
  readonly projectName?: string
}

/** Creates the smallest valid product project without choosing a musical Track template. */
export function createMinimalNewProjectSession(
  input: CreateMinimalNewProjectSessionInput,
): ProjectSession {
  return createInitialProjectSession({
    projectId: input.projectId,
    projectName: input.projectName ?? MINIMAL_NEW_PROJECT_NAME,
    tempoEventId: parseTempoEventId(input.createUniqueId()),
    timeSignatureEventId: parseTimeSignatureEventId(input.createUniqueId()),
  })
}
