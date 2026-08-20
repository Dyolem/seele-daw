import { describe, expect, it } from 'vitest'
import { BrowserLocalFileByteReader, BrowserLocalFileReadError } from '#internal/index'

describe('BrowserLocalFileByteReader', () => {
  it('copies File-compatible Blob bytes without exposing the source buffer', async () => {
    const source = new Uint8Array([0x4d, 0x54, 0x68, 0x64])
    const file = new Blob([source], { type: 'audio/midi' })
    const bytes = await new BrowserLocalFileByteReader().read(file)

    expect(bytes).toEqual(source)
    expect(bytes.buffer).not.toBe(source.buffer)
    bytes[0] = 0
    await expect(file.arrayBuffer()).resolves.toEqual(
      expect.objectContaining({ byteLength: source.byteLength }),
    )
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(source)
  })

  it('accepts an empty local file and leaves format validation to its consumer', async () => {
    await expect(new BrowserLocalFileByteReader().read(new Blob())).resolves.toEqual(
      new Uint8Array(),
    )
  })

  it('preserves a local File name while wrapping an asynchronous read failure', async () => {
    const cause = new Error('permission revoked')
    const file = {
      name: 'song.mid',
      size: 8,
      arrayBuffer: () => Promise.reject(cause),
    } as unknown as Blob

    await expect(new BrowserLocalFileByteReader().read(file)).rejects.toMatchObject({
      code: 'read-failed',
      fileName: 'song.mid',
      failureCause: cause,
    })
  })

  it('rejects invalid file values before invoking browser I/O', async () => {
    const arrayBuffer = () => Promise.resolve(new ArrayBuffer(0))
    const invalidFile = { size: Number.NaN, arrayBuffer } as unknown as Blob

    await expect(new BrowserLocalFileByteReader().read(invalidFile)).rejects.toEqual(
      expect.objectContaining<Partial<BrowserLocalFileReadError>>({ code: 'invalid-file' }),
    )
  })

  it('rejects non-ArrayBuffer and truncated browser read results explicitly', async () => {
    const invalidResult = {
      name: 'invalid.mid',
      size: 1,
      arrayBuffer: () => Promise.resolve({ byteLength: 1 }),
    } as unknown as Blob
    await expect(new BrowserLocalFileByteReader().read(invalidResult)).rejects.toMatchObject({
      code: 'invalid-read-result',
      fileName: 'invalid.mid',
    })

    const truncated = {
      name: 'truncated.mid',
      size: 2,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
    } as unknown as Blob
    await expect(new BrowserLocalFileByteReader().read(truncated)).rejects.toMatchObject({
      code: 'byte-length-mismatch',
      fileName: 'truncated.mid',
      expectedByteLength: 2,
      actualByteLength: 1,
    })
  })
})
