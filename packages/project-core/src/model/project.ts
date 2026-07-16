import { parseProjectId, type ProjectId } from './ids'
import { parseEntityName } from './scalars'

export interface ProjectRecord {
  readonly id: ProjectId
  readonly name: string
}

export interface CreateProjectRecordInput {
  readonly id: ProjectId
  readonly name: string
}

export function createProjectRecord(input: CreateProjectRecordInput): ProjectRecord {
  return {
    id: parseProjectId(input.id),
    name: parseEntityName(input.name),
  }
}
