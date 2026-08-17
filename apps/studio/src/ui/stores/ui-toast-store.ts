import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { UI_TOAST_TONE, type ShowUiToastInput, type UiToastMessage } from '@/ui/components/ui-toast'

/**
 * Owns the application-wide single-slot notification channel.
 *
 * Features trigger semantic commands; the root Region renders the latest
 * message declaratively. New messages intentionally replace older messages.
 */
export const useUiToastStore = defineStore('ui-toast', () => {
  const message = shallowRef<UiToastMessage | null>(null)
  let messageSequence = 0

  function show(input: ShowUiToastInput): number {
    messageSequence += 1
    message.value = Object.freeze({
      ...input,
      id: messageSequence,
    })
    return messageSequence
  }

  function info(title: string, description?: string): number {
    return show({ description, title, tone: UI_TOAST_TONE.INFO })
  }

  function success(title: string, description?: string): number {
    return show({ description, title, tone: UI_TOAST_TONE.SUCCESS })
  }

  function warning(title: string, description?: string): number {
    return show({ description, title, tone: UI_TOAST_TONE.WARNING })
  }

  function danger(title: string, description?: string): number {
    return show({ description, title, tone: UI_TOAST_TONE.DANGER })
  }

  function dismiss(messageId: number): boolean {
    if (message.value?.id !== messageId) return false
    message.value = null
    return true
  }

  return {
    message,
    danger,
    dismiss,
    info,
    show,
    success,
    warning,
  }
})
