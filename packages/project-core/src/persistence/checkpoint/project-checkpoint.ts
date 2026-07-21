import { parseProjectId, type ProjectId } from '#internal/model/ids'
import { parseModelRevision, type ModelRevision } from '#internal/model/model-revision'
import { parseOpaqueId } from '#internal/model/opaque-id'
import type { ProjectFileDTO } from '#internal/persistence/project-file-dto'
import { createProjectFileDTO } from '#internal/persistence/project-file-projector'
import type { ProjectSnapshot } from '#internal/snapshots/project-snapshot'
import type { Brand } from '@seele-daw/type-utils'

export const PROJECT_CHECKPOINT_FORMAT_VERSION = 1 as const

export type ProjectCheckpointFormatVersion = typeof PROJECT_CHECKPOINT_FORMAT_VERSION
export type ProjectCheckpointId = Brand<string, 'ProjectCheckpointId'>

export interface ProjectCheckpoint {
  readonly checkpointFormatVersion: ProjectCheckpointFormatVersion
  readonly checkpointId: ProjectCheckpointId
  readonly projectId: ProjectId
  readonly sourceModelRevision: ModelRevision
  readonly projectFile: ProjectFileDTO
}

export interface CreateProjectCheckpointInput {
  readonly checkpointId: ProjectCheckpointId
}

export function parseProjectCheckpointId(value: unknown): ProjectCheckpointId {
  return parseOpaqueId<ProjectCheckpointId>(value, 'ProjectCheckpointId')
}

/** Creates one immutable storage envelope from one revision-consistent Snapshot. */
export function createProjectCheckpoint(
  snapshot: ProjectSnapshot,
  input: CreateProjectCheckpointInput,
): ProjectCheckpoint {
  return Object.freeze({
    checkpointFormatVersion: PROJECT_CHECKPOINT_FORMAT_VERSION,
    checkpointId: parseProjectCheckpointId(input.checkpointId),
    projectId: parseProjectId(snapshot.project.id),
    sourceModelRevision: parseModelRevision(snapshot.modelRevision),
    projectFile: createProjectFileDTO(snapshot),
  })
}
