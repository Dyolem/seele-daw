import { HotkeyRecorder } from '@tanstack/hotkeys'
import type { StudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'
import type { StudioKeyboardInput } from '@/workbench/keyboard/studio-keyboard-input-router'

export type StudioShortcutRecordingResult =
  | { readonly status: 'recorded'; readonly binding: StudioKeyboardBinding }
  | { readonly status: 'cleared' | 'cancelled' }
  | { readonly status: 'failed'; readonly message: string }

/** One focused recording session; TanStack owns chord capture, Studio owns its input lifetime. */
export function createBrowserStudioShortcutRecorder(keyboard: StudioKeyboardInput) {
  let cancelCurrent: (() => void) | null = null
  let disposed = false

  return {
    start(
      owner: HTMLElement,
      onResult: (result: StudioShortcutRecordingResult) => void,
    ): () => void {
      cancelCurrent?.()
      if (disposed || !owner.isConnected || owner.ownerDocument !== document) {
        onResult({
          status: 'failed',
          message: 'Recording is unavailable. Type a key combination instead.',
        })
        return () => {}
      }
      owner.focus({ preventScroll: true })
      const release = keyboard.suspend()
      let finished = false
      const recorder = new HotkeyRecorder({
        onRecord(input) {
          // TanStack emits an empty onRecord after onClear; finish is idempotent.
          if (finished) return
          const validation = keyboard.validateBindingInput(input)
          if (validation.binding === null)
            finish({ status: 'failed', message: validation.errors.join(' ') })
          else finish({ status: 'recorded', binding: validation.binding })
        },
        onClear: () => finish({ status: 'cleared' }),
        onCancel: () => finish({ status: 'cancelled' }),
      })
      function finish(result: StudioShortcutRecordingResult): void {
        if (finished) return
        finished = true
        recorder.destroy()
        window.removeEventListener('keydown', guard, true)
        window.removeEventListener('blur', cancel)
        document.removeEventListener('focusin', checkFocus, true)
        document.removeEventListener('visibilitychange', checkVisibility)
        if (cancelCurrent === cancel) cancelCurrent = null
        release()
        onResult(result)
      }
      function cancel(): void {
        finish({ status: 'cancelled' })
      }
      function checkFocus(): void {
        if (document.activeElement !== owner) cancel()
      }
      function checkVisibility(): void {
        if (document.hidden) cancel()
      }
      function guard(event: KeyboardEvent): void {
        if (document.activeElement !== owner || !owner.isConnected) {
          cancel()
          return
        }
        // The upstream recorder does not filter composition, repeats or already consumed events.
        if (
          event.isComposing ||
          event.keyCode === 229 ||
          event.repeat ||
          event.defaultPrevented ||
          event.getModifierState('AltGraph') ||
          ['Dead', 'Process', 'Unidentified'].includes(event.key)
        ) {
          event.stopImmediatePropagation()
          if (!event.isComposing && event.keyCode !== 229) event.preventDefault()
        }
      }
      cancelCurrent = cancel
      window.addEventListener('keydown', guard, true)
      window.addEventListener('blur', cancel)
      document.addEventListener('focusin', checkFocus, true)
      document.addEventListener('visibilitychange', checkVisibility)
      try {
        recorder.start()
      } catch {
        finish({
          status: 'failed',
          message: 'Recording could not start. Type a key combination instead.',
        })
      }
      return cancel
    },
    dispose(): void {
      disposed = true
      cancelCurrent?.()
    },
  }
}

export type StudioShortcutRecorder = ReturnType<typeof createBrowserStudioShortcutRecorder>
