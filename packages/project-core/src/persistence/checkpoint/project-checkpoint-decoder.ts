import { DomainValueError } from '#internal/model/domain-value-error'
import { parseProjectId, type ProjectId } from '#internal/model/ids'
import {
  ModelRevisionError,
  parseModelRevision,
  type ModelRevision,
} from '#internal/model/model-revision'
import {
  PROJECT_CHECKPOINT_FORMAT_VERSION,
  parseProjectCheckpointId,
  type ProjectCheckpoint,
  type ProjectCheckpointId,
} from '#internal/persistence/checkpoint/project-checkpoint'
import {
  ProjectCheckpointValidationError,
  type ProjectCheckpointValidationErrorCode,
  type ProjectCheckpointValidationErrorDetails,
  type ProjectCheckpointValidationPathSegment,
} from '#internal/persistence/checkpoint/project-checkpoint-error'
import { decodeProjectFileDTO } from '#internal/persistence/project-file-decoder'
import type { ProjectFileDTO } from '#internal/persistence/project-file-dto'
import { ProjectFileValidationError } from '#internal/persistence/project-file-validation-error'

type ValidationPath = readonly ProjectCheckpointValidationPathSegment[]
type DataFields = ReadonlyMap<string, unknown>

const PROJECT_CHECKPOINT_FIELDS = Object.freeze({
  checkpointFormatVersion: true,
  checkpointId: true,
  projectId: true,
  sourceModelRevision: true,
  projectFile: true,
} satisfies Readonly<Record<keyof ProjectCheckpoint, true>>)

function formatPath(path: ValidationPath): string {
  return path.reduce<string>(
    (formatted, segment) => `${formatted}[${JSON.stringify(segment)}]`,
    'ProjectCheckpoint',
  )
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function rejectValidation(
  code: ProjectCheckpointValidationErrorCode,
  path: ValidationPath,
  message: string,
  details: Omit<ProjectCheckpointValidationErrorDetails, 'path'> = {},
): never {
  throw new ProjectCheckpointValidationError(code, message, { ...details, path })
}

function inspectDataObject(value: unknown): DataFields {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return rejectValidation('invalid-type', [], 'ProjectCheckpoint must be a plain object', {
      actual: describeValue(value),
      expected: 'a plain object',
    })
  }

  let prototype: object | null
  let ownKeys: readonly PropertyKey[]

  try {
    prototype = Object.getPrototypeOf(value)
    ownKeys = Reflect.ownKeys(value)
  } catch (cause) {
    return rejectValidation(
      'invalid-object-property',
      [],
      'ProjectCheckpoint must be passive inspectable data',
      { cause, expected: 'an inspectable plain object' },
    )
  }

  if (prototype !== Object.prototype && prototype !== null) {
    return rejectValidation('invalid-type', [], 'ProjectCheckpoint must be a plain object', {
      actual: 'object with a non-plain prototype',
      expected: 'a plain object',
    })
  }

  const fields = new Map<string, unknown>()

  for (const key of ownKeys) {
    if (typeof key !== 'string') {
      return rejectValidation(
        'invalid-object-property',
        [],
        'ProjectCheckpoint cannot contain symbol properties',
        { actual: 'symbol property', expected: 'enumerable string data properties' },
      )
    }

    let descriptor: PropertyDescriptor | undefined

    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch (cause) {
      return rejectValidation(
        'invalid-object-property',
        [key],
        `Cannot inspect ${formatPath([key])}`,
        { cause, expected: 'an enumerable data property' },
      )
    }

    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return rejectValidation(
        'invalid-object-property',
        [key],
        `${formatPath([key])} must be an enumerable data property`,
        { actual: 'accessor or non-enumerable property', expected: 'an enumerable data property' },
      )
    }

    fields.set(key, descriptor.value)
  }

  return fields
}

function requireField(fields: DataFields, field: keyof ProjectCheckpoint): unknown {
  if (!fields.has(field)) {
    return rejectValidation(
      'missing-property',
      [field],
      `Missing required property ${formatPath([field])}`,
      { expected: 'a required own data property' },
    )
  }

  return fields.get(field)
}

function validateExactFields(fields: DataFields): void {
  for (const field of Object.keys(PROJECT_CHECKPOINT_FIELDS) as (keyof ProjectCheckpoint)[]) {
    requireField(fields, field)
  }

  const unexpected = [...fields.keys()]
    .filter((field) => !Object.hasOwn(PROJECT_CHECKPOINT_FIELDS, field))
    .sort()

  if (unexpected[0] !== undefined) {
    rejectValidation(
      'unexpected-property',
      [unexpected[0]],
      `Unexpected property ${formatPath([unexpected[0]])}`,
      { actual: 'an undeclared property', expected: 'only ProjectCheckpoint V1 fields' },
    )
  }
}

function decodeFormatVersion(fields: DataFields): void {
  const value = requireField(fields, 'checkpointFormatVersion')

  if (typeof value !== 'number') {
    rejectValidation(
      'invalid-type',
      ['checkpointFormatVersion'],
      `${formatPath(['checkpointFormatVersion'])} must be the number 1`,
      { actual: describeValue(value), expected: 'the number 1' },
    )
  }

  if (value !== PROJECT_CHECKPOINT_FORMAT_VERSION) {
    rejectValidation(
      'unsupported-checkpoint-format-version',
      ['checkpointFormatVersion'],
      `Unsupported Project Checkpoint format version ${value}`,
      { actual: String(value), expected: String(PROJECT_CHECKPOINT_FORMAT_VERSION) },
    )
  }
}

function decodeCheckpointId(value: unknown): ProjectCheckpointId {
  try {
    return parseProjectCheckpointId(value)
  } catch (cause) {
    if (!(cause instanceof DomainValueError)) throw cause

    return rejectValidation(
      'invalid-checkpoint-id',
      ['checkpointId'],
      `${formatPath(['checkpointId'])} must be a valid opaque checkpoint ID`,
      { cause, actual: describeValue(value), expected: 'a valid ProjectCheckpointId' },
    )
  }
}

function decodeProjectId(value: unknown): ProjectId {
  try {
    return parseProjectId(value)
  } catch (cause) {
    if (!(cause instanceof DomainValueError)) throw cause

    return rejectValidation(
      'invalid-project-id',
      ['projectId'],
      `${formatPath(['projectId'])} must be a valid ProjectId`,
      { cause, actual: describeValue(value), expected: 'a valid ProjectId' },
    )
  }
}

function decodeSourceModelRevision(value: unknown): ModelRevision {
  if (typeof value !== 'number') {
    return rejectValidation(
      'invalid-source-model-revision',
      ['sourceModelRevision'],
      `${formatPath(['sourceModelRevision'])} must be a non-negative safe integer`,
      { actual: describeValue(value), expected: 'a non-negative safe integer' },
    )
  }

  try {
    return parseModelRevision(value)
  } catch (cause) {
    if (!(cause instanceof ModelRevisionError)) throw cause

    return rejectValidation(
      'invalid-source-model-revision',
      ['sourceModelRevision'],
      `${formatPath(['sourceModelRevision'])} must be a non-negative safe integer`,
      { cause, actual: describeValue(value), expected: 'a non-negative safe integer' },
    )
  }
}

function decodeProjectFile(value: unknown): ProjectFileDTO {
  try {
    return decodeProjectFileDTO(value)
  } catch (cause) {
    if (!(cause instanceof ProjectFileValidationError)) throw cause

    return rejectValidation(
      'invalid-project-file',
      ['projectFile', ...cause.path],
      'ProjectCheckpoint contains an invalid Project File',
      { cause, expected: 'a valid ProjectFileDTO' },
    )
  }
}

/** Decodes and detaches one untrusted structured Checkpoint value. */
export function decodeProjectCheckpoint(input: unknown): ProjectCheckpoint {
  const fields = inspectDataObject(input)

  decodeFormatVersion(fields)
  validateExactFields(fields)

  const checkpointId = decodeCheckpointId(requireField(fields, 'checkpointId'))
  const projectId = decodeProjectId(requireField(fields, 'projectId'))
  const sourceModelRevision = decodeSourceModelRevision(requireField(fields, 'sourceModelRevision'))
  const projectFile = decodeProjectFile(requireField(fields, 'projectFile'))

  if (projectFile.projectId !== projectId) {
    rejectValidation(
      'project-id-mismatch',
      ['projectFile', 'projectId'],
      'ProjectCheckpoint projectId must match its nested Project File projectId',
      { actual: projectFile.projectId, expected: projectId },
    )
  }

  return Object.freeze({
    checkpointFormatVersion: PROJECT_CHECKPOINT_FORMAT_VERSION,
    checkpointId,
    projectId,
    sourceModelRevision,
    projectFile,
  })
}

/** @internal Creates a candidate-level Project ID mismatch with the public error protocol. */
export function rejectProjectCheckpointRequestMismatch(
  actualProjectId: string,
  expectedProjectId: string,
): never {
  return rejectValidation(
    'project-id-mismatch',
    ['projectId'],
    'ProjectCheckpoint projectId does not match the requested project',
    { actual: actualProjectId, expected: expectedProjectId },
  )
}
