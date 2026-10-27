export interface LocalFileByteReader {
  read(file: Blob): Promise<Uint8Array>
}

/** Reads a browser File or Blob into a byte array the caller owns. */
export class BrowserLocalFileByteReader implements LocalFileByteReader {
  async read(file: Blob): Promise<Uint8Array> {
    const name = (file as Partial<File>).name ?? 'the local file'
    let buffer: ArrayBuffer

    try {
      buffer = await file.arrayBuffer()
    } catch (cause) {
      throw new Error(`Could not read ${name}.`, { cause })
    }

    if (buffer.byteLength !== file.size) {
      throw new Error(
        `Reading ${name} returned ${buffer.byteLength} bytes for a ${file.size}-byte file.`,
      )
    }

    return new Uint8Array(buffer)
  }
}
