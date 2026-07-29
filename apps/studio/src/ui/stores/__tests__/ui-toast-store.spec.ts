import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { UI_TOAST_TONE } from '@/ui/components/ui-toast'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

describe('UI Toast Store', () => {
  it('exposes semantic imperative commands over one declarative message slot', () => {
    const toasts = useUiToastStore(createPinia())

    const infoId = toasts.info(
      'Sampler is in development',
      'This Track type will arrive later.',
    )

    expect(infoId).toBe(1)
    expect(toasts.message).toEqual({
      description: 'This Track type will arrive later.',
      id: 1,
      title: 'Sampler is in development',
      tone: UI_TOAST_TONE.INFO,
    })
    expect(Object.isFrozen(toasts.message)).toBe(true)

    const dangerId = toasts.danger('Track could not be added')

    expect(dangerId).toBe(2)
    expect(toasts.message).toEqual({
      description: undefined,
      id: 2,
      title: 'Track could not be added',
      tone: UI_TOAST_TONE.DANGER,
    })
  })

  it('dismisses only the exact currently rendered message', () => {
    const toasts = useUiToastStore(createPinia())
    const staleId = toasts.info('First')
    const currentId = toasts.success('Second')

    expect(toasts.dismiss(staleId)).toBe(false)
    expect(toasts.message?.id).toBe(currentId)
    expect(toasts.dismiss(currentId)).toBe(true)
    expect(toasts.message).toBeNull()
  })
})
