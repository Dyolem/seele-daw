import { parseProjectId, type ProjectId } from '@/model/ids'
import type { ModelRevision } from '@/model/model-revision'
import {
  createProjectCheckpoint,
  type CreateProjectCheckpointInput,
  type ProjectCheckpoint,
  type ProjectCheckpointId,
} from '@/persistence/checkpoint/project-checkpoint'
import {
  decodeProjectCheckpoint,
  rejectProjectCheckpointRequestMismatch,
} from '@/persistence/checkpoint/project-checkpoint-decoder'
import {
  ProjectCheckpointOperationError,
  ProjectCheckpointValidationError,
  type ProjectCheckpointCandidateFailure,
} from '@/persistence/checkpoint/project-checkpoint-error'
import type { ProjectCheckpointStore } from '@/persistence/checkpoint/project-checkpoint-store'
import { ProjectFileLoadError } from '@/persistence/project-file-load-error'
import { createProjectSessionFromDecodedProjectFile } from '@/persistence/project-file-loader'
import type { ProjectSession } from '@/session/project-session'

export type SaveProjectCheckpointInput = CreateProjectCheckpointInput

export interface ProjectCheckpointSaveReceipt {
  readonly checkpointId: ProjectCheckpointId
  readonly projectId: ProjectId
  readonly sourceModelRevision: ModelRevision
}

export interface ProjectCheckpointRestoreResult {
  readonly checkpoint: ProjectCheckpoint
  readonly session: ProjectSession
  readonly rejectedCandidates: readonly ProjectCheckpointCandidateFailure[]
}

function createSaveReceipt(checkpoint: ProjectCheckpoint): ProjectCheckpointSaveReceipt {
  return Object.freeze({
    checkpointId: checkpoint.checkpointId,
    projectId: checkpoint.projectId,
    sourceModelRevision: checkpoint.sourceModelRevision,
  })
}

function createCandidateFailure(
  candidateIndex: number,
  failureCause: unknown,
): ProjectCheckpointCandidateFailure {
  return Object.freeze({ candidateIndex, failureCause })
}

function isRecoverableCandidateFailure(
  error: unknown,
): error is ProjectCheckpointValidationError | ProjectFileLoadError {
  return error instanceof ProjectCheckpointValidationError || error instanceof ProjectFileLoadError
}

/** Captures and saves exactly one Session revision without entering the commit path. */
export async function saveProjectCheckpoint(
  store: ProjectCheckpointStore,
  session: ProjectSession,
  input: SaveProjectCheckpointInput,
): Promise<ProjectCheckpointSaveReceipt> {
  const checkpoint = createProjectCheckpoint(session.getSnapshot(), input)

  try {
    await store.save(checkpoint)
  } catch (cause) {
    throw new ProjectCheckpointOperationError(
      'store-write-failed',
      `Could not save Project Checkpoint ${checkpoint.checkpointId}`,
      { cause },
    )
  }

  return createSaveReceipt(checkpoint)
}

/** Restores the first fully valid candidate as a fresh Session. */
export async function restoreProjectCheckpoint(
  store: ProjectCheckpointStore,
  projectId: ProjectId,
): Promise<ProjectCheckpointRestoreResult | null> {
  const expectedProjectId = parseProjectId(projectId)
  let candidates: readonly unknown[]

  try {
    candidates = Object.freeze([...(await store.readCandidates(expectedProjectId))])
  } catch (cause) {
    throw new ProjectCheckpointOperationError(
      'store-read-failed',
      `Could not read Project Checkpoints for ${expectedProjectId}`,
      { cause },
    )
  }

  if (candidates.length === 0) return null

  const rejectedCandidates: ProjectCheckpointCandidateFailure[] = []

  for (const [candidateIndex, candidate] of candidates.entries()) {
    try {
      const checkpoint = decodeProjectCheckpoint(candidate)

      if (checkpoint.projectId !== expectedProjectId) {
        rejectProjectCheckpointRequestMismatch(checkpoint.projectId, expectedProjectId)
      }

      const session = createProjectSessionFromDecodedProjectFile(checkpoint.projectFile)

      return Object.freeze({
        checkpoint,
        session,
        rejectedCandidates: Object.freeze([...rejectedCandidates]),
      })
    } catch (error) {
      if (!isRecoverableCandidateFailure(error)) throw error
      rejectedCandidates.push(createCandidateFailure(candidateIndex, error))
    }
  }

  throw new ProjectCheckpointOperationError(
    'no-valid-checkpoint',
    `No valid Project Checkpoint could restore ${expectedProjectId}`,
    { candidateFailures: rejectedCandidates },
  )
}
