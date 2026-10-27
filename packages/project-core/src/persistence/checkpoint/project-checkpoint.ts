import { parseProjectId, type ProjectId } from '#internal/model/ids'
import { parseModelRevision, type ModelRevision } from '#internal/model/model-revision'
import { parseOpaqueId } from '#internal/model/opaque-id'
import {
  createProjectFile,
  readProjectFile,
  type ProjectFile,
} from '#internal/persistence/project-file'
import {
  readField,
  readFields,
  readJson,
  readValue,
  rejectData,
  type Fields,
} from '#internal/persistence/stored-data'
import type { ProjectSnapshot } from '#internal/snapshots/project-snapshot'
import type { Brand } from '@seele-daw/type-utils'

export const PROJECT_CHECKPOINT_FORMAT_VERSION = 1 as const

export type ProjectCheckpointFormatVersion = typeof PROJECT_CHECKPOINT_FORMAT_VERSION
export type ProjectCheckpointId = Brand<string, 'ProjectCheckpointId'>

/** One saved revision of a project: its file, plus what a store needs to tell saves apart. */
export interface ProjectCheckpoint {
  readonly checkpointFormatVersion: ProjectCheckpointFormatVersion
  readonly checkpointId: ProjectCheckpointId
  readonly projectId: ProjectId
  readonly sourceModelRevision: ModelRevision
  readonly projectFile: ProjectFile
}

/** Storage-neutral port that platform code, such as IndexedDB, implements. */
export interface ProjectCheckpointStore {
  save(checkpoint: ProjectCheckpoint): Promise<void>

  /** Returns the active Checkpoint, then the previous one, then any other candidates. */
  readCandidates(projectId: ProjectId): Promise<readonly unknown[]>
}

export interface CreateProjectCheckpointInput {
  readonly checkpointId: ProjectCheckpointId
}

const PROJECT_CHECKPOINT: Fields<ProjectCheckpoint> = {
  checkpointFormatVersion: true,
  checkpointId: true,
  projectId: true,
  sourceModelRevision: true,
  projectFile: true,
}

export function parseProjectCheckpointId(value: unknown): ProjectCheckpointId {
  return parseOpaqueId<ProjectCheckpointId>(value, 'ProjectCheckpointId')
}

export function createProjectCheckpoint(
  snapshot: ProjectSnapshot,
  input: CreateProjectCheckpointInput,
): ProjectCheckpoint {
  return Object.freeze({
    checkpointFormatVersion: PROJECT_CHECKPOINT_FORMAT_VERSION,
    checkpointId: parseProjectCheckpointId(input.checkpointId),
    projectId: snapshot.project.id,
    sourceModelRevision: snapshot.modelRevision,
    projectFile: createProjectFile(snapshot),
  })
}

/** Reads one untrusted stored value as a Checkpoint, decoding the file inside it. */
export function decodeProjectCheckpoint(input: unknown): ProjectCheckpoint {
  const value = readJson(input)
  const formatVersion = readField(value, 'checkpointFormatVersion', [])

  if (formatVersion !== PROJECT_CHECKPOINT_FORMAT_VERSION) {
    rejectData(
      `Expected Checkpoint format ${PROJECT_CHECKPOINT_FORMAT_VERSION}, found ${JSON.stringify(formatVersion)}`,
      ['checkpointFormatVersion'],
    )
  }

  const checkpoint = readFields(value, PROJECT_CHECKPOINT, [])
  const checkpointId = readValue(['checkpointId'], () =>
    parseProjectCheckpointId(checkpoint.checkpointId),
  )
  const projectId = readValue(['projectId'], () => parseProjectId(checkpoint.projectId))
  const sourceModelRevision = readValue(['sourceModelRevision'], () =>
    parseModelRevision(checkpoint.sourceModelRevision),
  )
  const projectFile = readProjectFile(checkpoint.projectFile, ['projectFile'])

  if (projectFile.project.id !== projectId) {
    rejectData(`The file belongs to project ${projectFile.project.id}, not ${projectId}`, [
      'projectFile',
      'project',
      'id',
    ])
  }

  return Object.freeze({
    checkpointFormatVersion: PROJECT_CHECKPOINT_FORMAT_VERSION,
    checkpointId,
    projectId,
    sourceModelRevision,
    projectFile,
  })
}
