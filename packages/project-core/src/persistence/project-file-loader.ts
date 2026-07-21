import { assertModelInvariants, ModelInvariantError } from '@/model/invariant-validator'
import { ModelStore } from '@/model/model-store'
import { decodeProjectFileDTO } from '@/persistence/project-file-decoder'
import { ProjectFileLoadError } from '@/persistence/project-file-load-error'
import { normalizeProjectFileDTO } from '@/persistence/project-file-normalizer'
import { createProjectSession, type ProjectSession } from '@/session/project-session'

/**
 * Creates a fresh in-memory Session from one structured project-file value.
 * Transport decoding, migration, storage, and history restoration are separate concerns.
 */
export function createProjectSessionFromProjectFile(input: unknown): ProjectSession {
  const dto = decodeProjectFileDTO(input)

  return createProjectSessionFromDecodedProjectFile(dto)
}

/** @internal Composes a Session after an owning decoder has already validated the DTO. */
export function createProjectSessionFromDecodedProjectFile(
  dto: ReturnType<typeof decodeProjectFileDTO>,
): ProjectSession {
  const store = new ModelStore(normalizeProjectFileDTO(dto))

  try {
    assertModelInvariants(store)
  } catch (error) {
    if (!(error instanceof ModelInvariantError)) throw error

    throw new ProjectFileLoadError(
      'model-invariants-violated',
      'Project file cannot form a valid runtime model',
      { cause: error },
    )
  }

  return createProjectSession(store)
}
