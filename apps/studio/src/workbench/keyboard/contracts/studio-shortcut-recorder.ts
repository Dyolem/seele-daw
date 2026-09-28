import type { StudioKeyboardBinding } from './studio-keyboard-binding'

export type StudioShortcutRecordingResult =
  | { readonly status: 'recorded'; readonly binding: StudioKeyboardBinding }
  | { readonly status: 'cleared' | 'cancelled' }
  | { readonly status: 'failed'; readonly message: string }

/** Records one draft combination for a focused control; the returned function cancels it. */
export interface StudioShortcutRecorder {
  start(owner: HTMLElement, onResult: (result: StudioShortcutRecordingResult) => void): () => void
}
