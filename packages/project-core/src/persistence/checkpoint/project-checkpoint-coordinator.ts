import { parseProjectId, type ProjectId } from '#internal/model/ids'
import type { ModelRevision } from '#internal/model/model-revision'
import {
  createProjectCheckpoint,
  decodeProjectCheckpoint,
  type CreateProjectCheckpointInput,
  type ProjectCheckpoint,
  type ProjectCheckpointId,
  type ProjectCheckpointStore,
} from '#internal/persistence/checkpoint/project-checkpoint'
import {
  ProjectCheckpointError,
  type ProjectCheckpointCandidateFailure,
} from '#internal/persistence/checkpoint/project-checkpoint-error'
import { ProjectFileError } from '#internal/persistence/project-file-error'
import { createSessionFromProjectFile } from '#internal/persistence/project-file-loader'
import type { ProjectSession } from '#internal/session/project-session'
import type { ProjectContentStateId } from '#internal/session/project-content-state-id'

export type SaveProjectCheckpointInput = CreateProjectCheckpointInput

export interface ProjectCheckpointSaveReceipt {
  readonly checkpointId: ProjectCheckpointId
  readonly projectId: ProjectId
  readonly sourceModelRevision: ModelRevision
  readonly sourceContentStateId: ProjectContentStateId
}

export interface ProjectCheckpointRestoreResult {
  readonly checkpoint: ProjectCheckpoint
  readonly session: ProjectSession
  readonly rejectedCandidates: readonly ProjectCheckpointCandidateFailure[]
}

/** Captures and saves exactly one Session revision without entering the commit path. */
export async function saveProjectCheckpoint(
  store: ProjectCheckpointStore,
  session: ProjectSession,
  input: SaveProjectCheckpointInput,
): Promise<ProjectCheckpointSaveReceipt> {
  const sourceContentStateId = session.contentStateId
  const checkpoint = createProjectCheckpoint(session.getSnapshot(), input)

  try {
    await store.save(checkpoint)
  } catch (cause) {
    throw new ProjectCheckpointError(
      'store-write-failed',
      `Could not save Project Checkpoint ${checkpoint.checkpointId}`,
      { cause },
    )
  }

  return Object.freeze({
    checkpointId: checkpoint.checkpointId,
    projectId: checkpoint.projectId,
    sourceModelRevision: checkpoint.sourceModelRevision,
    sourceContentStateId,
  })
}

function restoreCandidate(
  candidate: unknown,
  projectId: ProjectId,
): Omit<ProjectCheckpointRestoreResult, 'rejectedCandidates'> {
  const checkpoint = decodeProjectCheckpoint(candidate)

  if (checkpoint.projectId !== projectId) {
    throw new ProjectFileError(
      'project-id-mismatch',
      `Checkpoint ${checkpoint.checkpointId} belongs to project ${checkpoint.projectId}, not ${projectId}`,
      ['projectId'],
    )
  }

  return { checkpoint, session: createSessionFromProjectFile(checkpoint.projectFile) }
}

/** Restores the first candidate that is a valid project, as a fresh Session. */
export async function restoreProjectCheckpoint(
  store: ProjectCheckpointStore,
  projectId: ProjectId,
): Promise<ProjectCheckpointRestoreResult | null> {
  const expectedProjectId = parseProjectId(projectId)
  let candidates: readonly unknown[]

  try {
    candidates = Object.freeze([...(await store.readCandidates(expectedProjectId))])
  } catch (cause) {
    throw new ProjectCheckpointError(
      'store-read-failed',
      `Could not read Project Checkpoints for ${expectedProjectId}`,
      { cause },
    )
  }

  if (candidates.length === 0) return null

  const rejectedCandidates: ProjectCheckpointCandidateFailure[] = []

  for (const [candidateIndex, candidate] of candidates.entries()) {
    try {
      return Object.freeze({
        ...restoreCandidate(candidate, expectedProjectId),
        rejectedCandidates: Object.freeze([...rejectedCandidates]),
      })
    } catch (error) {
      if (!(error instanceof ProjectFileError)) throw error
      rejectedCandidates.push(Object.freeze({ candidateIndex, failureCause: error }))
    }
  }

  throw new ProjectCheckpointError(
    'no-valid-checkpoint',
    `No valid Project Checkpoint could restore ${expectedProjectId}`,
    { candidateFailures: rejectedCandidates },
  )
}
