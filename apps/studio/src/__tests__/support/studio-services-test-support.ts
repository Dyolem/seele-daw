import { STUDIO_SERVICES_KEY, type StudioServices } from '@/workbench/studio-services'

export type TestStudioServices = Partial<Omit<StudioServices, 'edits'>> & {
  readonly edits?: Partial<StudioServices['edits']>
}

/** Reaching for a member the test did not provide fails loudly instead of reading undefined. */
function strict<T extends object>(members: Partial<T>, kind: string): T {
  return new Proxy(members as T, {
    get(target, key, receiver) {
      // Vue and Vitest probe internal markers such as `__v_isRef`; those must read as absent.
      if (typeof key === 'symbol' || key.startsWith('__') || key in target) {
        return Reflect.get(target, key, receiver)
      }
      throw new Error(`The test did not provide the ${kind} "${key}"`)
    },
  })
}

export function createTestStudioServices(services: TestStudioServices): StudioServices {
  const { edits, ...rest } = services
  return strict<StudioServices>(
    edits === undefined ? rest : { ...rest, edits: strict(edits, 'Project edit') },
    'Studio service',
  )
}

/** The `global.provide` entry for mounting a component with the given Studio services. */
export function provideTestStudioServices(
  services: TestStudioServices,
): Record<symbol, StudioServices> {
  return { [STUDIO_SERVICES_KEY as symbol]: createTestStudioServices(services) }
}
