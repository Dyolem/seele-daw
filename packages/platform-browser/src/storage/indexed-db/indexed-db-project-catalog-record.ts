import {
  PROJECT_CATALOG_RECORD_VERSION,
  type ProjectCatalogRecordV1,
} from '#internal/storage/indexed-db/indexed-db-schema'
import {
  parseEntityName,
  parseProjectId,
  type ProjectCheckpoint,
  type ProjectId,
} from '@seele-daw/project-core'

const CATALOG_FIELDS = Object.freeze([
  'catalogRecordVersion',
  'projectId',
  'name',
  'lastCheckpointSavedAt',
] as const)

export interface ProjectCatalogEntry {
  readonly projectId: ProjectId
  readonly name: string
  readonly lastCheckpointSavedAt: number
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('expected a non-negative safe integer timestamp')
  }

  return value
}

function readCatalogFields(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`expected object, received ${describeValue(value)}`)
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actualKeys = Reflect.ownKeys(descriptors)

  if (
    actualKeys.length !== CATALOG_FIELDS.length ||
    actualKeys.some(
      (key) => typeof key !== 'string' || !CATALOG_FIELDS.some((field) => field === key),
    )
  ) {
    throw new TypeError('expected the exact Project Catalog V1 fields')
  }

  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const field of CATALOG_FIELDS) {
    const descriptor = descriptors[field]
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`${field} must be a data property`)
    }
    fields[field] = descriptor.value
  }

  return fields
}

export function createProjectCatalogRecord(
  checkpoint: ProjectCheckpoint,
  projectId: ProjectId,
  currentTime: unknown,
): ProjectCatalogRecordV1 {
  return {
    catalogRecordVersion: PROJECT_CATALOG_RECORD_VERSION,
    projectId,
    name: parseEntityName(checkpoint.projectFile.name),
    lastCheckpointSavedAt: parseTimestamp(currentTime),
  }
}

export function decodeProjectCatalogRecord(value: unknown): ProjectCatalogEntry {
  const fields = readCatalogFields(value)
  if (fields.catalogRecordVersion !== PROJECT_CATALOG_RECORD_VERSION) {
    throw new TypeError(`unsupported Catalog record version ${String(fields.catalogRecordVersion)}`)
  }

  return Object.freeze({
    projectId: parseProjectId(fields.projectId),
    name: parseEntityName(fields.name),
    lastCheckpointSavedAt: parseTimestamp(fields.lastCheckpointSavedAt),
  })
}
