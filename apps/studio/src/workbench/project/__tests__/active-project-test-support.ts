import {
  createInitialProjectSession,
  createProjectCheckpoint,
  parseProjectCheckpointId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  type ModelRevision,
  type ProjectCheckpoint,
  type ProjectCheckpointId,
  type ProjectCheckpointStore,
  type ProjectCommand,
  type ProjectCommandExecutionResult,
  type ProjectCommit,
  type ProjectId,
  type ProjectQuery,
  type ProjectQueryResultFor,
  type ProjectSession,
  type ProjectSnapshot,
  type ProjectSubscription,
  type ProjectSubscriptionObserver,
  type ProjectUnsubscribe,
} from '@seele-daw/project-core'

export interface Deferred<Value = void> {
  readonly promise: Promise<Value>
  readonly resolve: (value: Value) => void
  readonly reject: (cause: unknown) => void
}

export function createDeferred(): Deferred<void> {
  let resolve!: () => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<void>((complete, fail) => {
    resolve = complete
    reject = fail
  })

  return { promise, resolve, reject }
}

export class ControlledProjectCheckpointStore implements ProjectCheckpointStore {
  readonly saved: ProjectCheckpoint[] = []
  readonly readProjectIds: ProjectId[] = []
  readonly candidatesByProject = new Map<ProjectId, readonly unknown[]>()
  readonly readGates = new Map<ProjectId, Promise<void>>()
  saveGate: Promise<void> | null = null
  saveFailure: unknown
  readFailure: unknown

  async save(checkpoint: ProjectCheckpoint): Promise<void> {
    this.saved.push(checkpoint)
    if (this.saveGate !== null) await this.saveGate
    if (this.saveFailure !== undefined) throw this.saveFailure
  }

  async readCandidates(projectId: ProjectId): Promise<readonly unknown[]> {
    this.readProjectIds.push(projectId)
    const gate = this.readGates.get(projectId)
    if (gate !== undefined) await gate
    if (this.readFailure !== undefined) throw this.readFailure

    return this.candidatesByProject.get(projectId) ?? []
  }
}

interface TestSubscriptionEntry {
  active: boolean
  readonly observer: ProjectSubscriptionObserver
}

/** Small mutable Session double used only to drive the public commit-observation boundary. */
export class MutableTestProjectSession implements ProjectSession {
  readonly #baseSession: ProjectSession
  readonly #subscriptions = new Set<TestSubscriptionEntry>()
  #modelRevision: ModelRevision

  constructor(projectId: ProjectId) {
    this.#baseSession = createInitialProjectSession({
      projectId,
      projectName: `Test ${projectId}`,
      tempoEventId: parseTempoEventId(`tempo-${projectId}`),
      timeSignatureEventId: parseTimeSignatureEventId(`meter-${projectId}`),
    })
    this.#modelRevision = this.#baseSession.modelRevision
  }

  get modelRevision(): ModelRevision {
    return this.#modelRevision
  }

  get canUndo(): boolean {
    return false
  }

  get canRedo(): boolean {
    return false
  }

  getSnapshot(): ProjectSnapshot {
    return Object.freeze({
      ...this.#baseSession.getSnapshot(),
      modelRevision: this.#modelRevision,
    })
  }

  query<Query extends ProjectQuery>(query: Query): ProjectQueryResultFor<Query> {
    return this.#baseSession.query(query)
  }

  subscribe(
    _subscription: ProjectSubscription,
    observer: ProjectSubscriptionObserver,
  ): ProjectUnsubscribe {
    const entry: TestSubscriptionEntry = { active: true, observer }
    this.#subscriptions.add(entry)

    return () => {
      entry.active = false
      this.#subscriptions.delete(entry)
    }
  }

  execute(_command: ProjectCommand): ProjectCommandExecutionResult {
    throw new Error('MutableTestProjectSession does not execute Project Commands')
  }

  undo(): ProjectCommit | null {
    return null
  }

  redo(): ProjectCommit | null {
    return null
  }

  async emitCommit(): Promise<void> {
    this.#modelRevision = (this.#modelRevision + 1) as ModelRevision
    await Promise.resolve()

    // ActiveProjectService intentionally observes the commit fact, not its payload.
    const commit = Object.freeze({}) as ProjectCommit
    const entries = Array.from(this.#subscriptions)
    for (const entry of entries) {
      if (entry.active) entry.observer.onCommit(commit)
    }
  }
}

export function createTestProjectId(suffix: string): ProjectId {
  return parseProjectId(`project-active-${suffix}`)
}

export function createTestSession(projectId: ProjectId): MutableTestProjectSession {
  return new MutableTestProjectSession(projectId)
}

export function createTestCheckpoint(
  projectId: ProjectId,
  checkpointId: string,
): ProjectCheckpoint {
  return createProjectCheckpoint(createTestSession(projectId).getSnapshot(), {
    checkpointId: parseProjectCheckpointId(checkpointId),
  })
}

export function createCheckpointIdFactory(prefix = 'checkpoint-active'): () => ProjectCheckpointId {
  let sequence = 0

  return () => {
    sequence += 1
    return parseProjectCheckpointId(`${prefix}-${sequence}`)
  }
}
