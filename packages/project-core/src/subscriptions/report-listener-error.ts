/**
 * Reports what a listener threw the way the platform reports an uncaught error, without unwinding
 * the publisher: the other listeners still run, and the listener stays subscribed. Every
 * publisher in the application reports listener errors this way.
 */
export function reportListenerError(cause: unknown): void {
  const { reportError } = globalThis as { readonly reportError?: (error: unknown) => void }
  if (reportError === undefined) void Promise.reject(cause)
  else reportError(cause)
}
