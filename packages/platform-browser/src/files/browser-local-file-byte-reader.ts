import { BrowserLocalFileReadError } from '#internal/files/browser-local-file-read-error'

export interface LocalFileByteReader {
  read(file: Blob): Promise<Uint8Array>
}

interface InspectedLocalFile {
  readonly fileName?: string
  readonly readArrayBuffer: () => Promise<ArrayBuffer>
  readonly size: number
}

function inspectLocalFile(file: Blob): InspectedLocalFile {
  if (file === null || typeof file !== 'object') {
    throw new BrowserLocalFileReadError(
      'invalid-file',
      'Local file input must be a Blob with a finite byte length.',
    )
  }

  const candidate = file as Blob & { readonly name?: unknown }
  const fileName = typeof candidate.name === 'string' ? candidate.name : undefined

  if (!Number.isSafeInteger(candidate.size) || candidate.size < 0) {
    throw new BrowserLocalFileReadError(
      'invalid-file',
      'Local file size must be a non-negative safe integer.',
      { fileName },
    )
  }
  if (typeof candidate.arrayBuffer !== 'function') {
    throw new BrowserLocalFileReadError(
      'invalid-file',
      'Local file input must provide Blob.arrayBuffer().',
      { fileName },
    )
  }

  return {
    ...(fileName === undefined ? {} : { fileName }),
    size: candidate.size,
    readArrayBuffer: () => candidate.arrayBuffer(),
  }
}

/** Reads an immutable browser File or Blob into an independently owned byte array. */
export class BrowserLocalFileByteReader implements LocalFileByteReader {
  async read(file: Blob): Promise<Uint8Array> {
    const inspected = inspectLocalFile(file)
    let sourceBuffer: ArrayBuffer

    try {
      sourceBuffer = await inspected.readArrayBuffer()
    } catch (cause) {
      throw new BrowserLocalFileReadError('read-failed', 'The local file could not be read.', {
        cause,
        fileName: inspected.fileName,
      })
    }

    let copiedBuffer: ArrayBuffer
    try {
      copiedBuffer = sourceBuffer.slice(0)
    } catch (cause) {
      throw new BrowserLocalFileReadError(
        'invalid-read-result',
        'Blob.arrayBuffer() did not return a readable ArrayBuffer.',
        { cause, fileName: inspected.fileName },
      )
    }

    if (copiedBuffer.byteLength !== inspected.size) {
      throw new BrowserLocalFileReadError(
        'byte-length-mismatch',
        `Local file read returned ${copiedBuffer.byteLength} bytes for a ${inspected.size}-byte file.`,
        {
          actualByteLength: copiedBuffer.byteLength,
          expectedByteLength: inspected.size,
          fileName: inspected.fileName,
        },
      )
    }

    return new Uint8Array(copiedBuffer)
  }
}
