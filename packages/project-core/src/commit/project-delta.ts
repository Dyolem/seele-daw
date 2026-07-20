import type { ProjectChange } from '@/commit/project-change'
import type { ModelRevision } from '@/model/model-revision'

/** Immutable semantic changes produced by one committed model revision. */
export interface ProjectDelta {
  readonly modelRevision: ModelRevision
  readonly changes: readonly ProjectChange[]
}
