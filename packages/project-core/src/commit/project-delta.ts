import type { ProjectChange } from '#internal/commit/project-change'
import type { ModelRevision } from '#internal/model/model-revision'

/** Immutable semantic changes produced by one committed model revision. */
export interface ProjectDelta {
  readonly modelRevision: ModelRevision
  readonly changes: readonly ProjectChange[]
}
