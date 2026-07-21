import { ModelStore } from '#internal/model/model-store'
import { createProjectSession } from '#internal/session/project-session'
import { createCompleteProjectFixture } from './complete-project-fixture'

/** Creates a hydrated Session directly from normalized fixture Records for kernel tests. */
export function createFixtureProjectSession() {
  const fixture = createCompleteProjectFixture()
  const store = new ModelStore(fixture.seed)
  const session = createProjectSession(store)

  return { fixture, store, session }
}
