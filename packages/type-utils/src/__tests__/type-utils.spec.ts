import { describe, expectTypeOf, it } from 'vitest'

import type { Brand, ValueOf } from '~/index'

describe('Brand', () => {
  it('keeps the runtime value type while separating nominal domains', () => {
    type ProjectId = Brand<string, 'ProjectId'>
    type TrackId = Brand<string, 'TrackId'>

    expectTypeOf<ProjectId>().toMatchTypeOf<string>()
    expectTypeOf<string>().not.toMatchTypeOf<ProjectId>()
    expectTypeOf<ProjectId>().not.toEqualTypeOf<TrackId>()
  })
})

describe('ValueOf', () => {
  it('produces flat and distributed nested property value unions', () => {
    type Status = ValueOf<{
      readonly DRAFT: 'draft'
      readonly PUBLISHED: 'published'
    }>
    type CommandGroup = ValueOf<{
      readonly NOTE: {
        readonly ADD: 'note.add'
      }
      readonly CLIP: {
        readonly REMOVE: 'clip.remove'
      }
    }>
    type CommandType = ValueOf<CommandGroup>

    expectTypeOf<Status>().toEqualTypeOf<'draft' | 'published'>()
    expectTypeOf<CommandType>().toEqualTypeOf<'note.add' | 'clip.remove'>()
    expectTypeOf<ValueOf<string>>().toEqualTypeOf<never>()
  })
})
