export function describeCause(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return fallback
}

export function describeFailure(cause: unknown): string {
  return describeCause(cause, 'The Piano Roll could not be rendered.')
}
