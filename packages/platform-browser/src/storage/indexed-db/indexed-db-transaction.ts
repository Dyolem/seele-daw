interface TransactionCompletion {
  abort(): void
  readonly done: Promise<unknown>
}

/** Aborts when possible and consumes the completion rejection before a stable adapter error escapes. */
export async function abortAndObserve(transaction: TransactionCompletion): Promise<void> {
  try {
    transaction.abort()
  } catch {
    // A failed request may already have aborted the transaction.
  }

  try {
    await transaction.done
  } catch {
    // The original stable adapter error is reported by the caller.
  }
}
