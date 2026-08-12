export const SAMPLE_RESOURCE_KEY_MAX_LENGTH = 1_024

export class SampleResourceKeyError extends TypeError {
  readonly detail: string

  constructor(message: string) {
    super(message)
    this.name = 'SampleResourceKeyError'
    this.detail = message
  }
}

function fail(message: string): never {
  throw new SampleResourceKeyError(message)
}

/** Rejects paths that could escape or become ambiguous after URL decoding. */
export function assertSafeSampleResourceKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > SAMPLE_RESOURCE_KEY_MAX_LENGTH ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0')
  ) {
    fail('resource key is not a safe relative POSIX path')
  }

  for (const segment of key.split('/')) {
    let decodedSegment: string
    try {
      decodedSegment = decodeURIComponent(segment)
    } catch {
      fail('resource key contains invalid percent encoding')
    }
    if (
      segment.length === 0 ||
      decodedSegment === '.' ||
      decodedSegment === '..' ||
      decodedSegment.includes('/') ||
      decodedSegment.includes('\\') ||
      decodedSegment.includes('\0')
    ) {
      fail('resource key contains an unsafe path segment')
    }
  }
}
