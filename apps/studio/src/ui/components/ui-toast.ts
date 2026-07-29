export const UI_TOAST_TONE = {
  DANGER: 'danger',
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
} as const

export type UiToastTone = (typeof UI_TOAST_TONE)[keyof typeof UI_TOAST_TONE]

export interface UiToastMessage {
  readonly description?: string
  readonly id: number
  readonly title: string
  readonly tone: UiToastTone
}

export type ShowUiToastInput = Omit<UiToastMessage, 'id'>
