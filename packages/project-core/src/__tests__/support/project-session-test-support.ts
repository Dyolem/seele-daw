import { ModelStore } from '@/model/model-store'
import { createProjectSession } from '@/session/project-session'
import { createCompleteProjectFixture } from './complete-project-fixture'

/** Creates a hydrated Session while ProjectFileDTO loading is not implemented. */
export function createFixtureProjectSession() {
  const fixture = createCompleteProjectFixture()
  const store = new ModelStore(fixture.seed)
  const session = createProjectSession(store)

  return { fixture, store, session }
}
