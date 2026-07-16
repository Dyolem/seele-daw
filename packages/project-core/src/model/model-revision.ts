import type { Brand } from './brand'

export type ModelRevision = Brand<number, 'ModelRevision'>

export const INITIAL_MODEL_REVISION = 0 as ModelRevision
