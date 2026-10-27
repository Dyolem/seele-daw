import { describe, expect, it } from 'vitest'
import { BrowserLocalFileByteReader } from '#internal/index'

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

  it('names the local File and keeps the cause of a failed read', async () => {
    const cause = new Error('permission revoked')
    const file = {
      name: 'song.mid',
      size: 8,
      arrayBuffer: () => Promise.reject(cause),
    } as unknown as Blob

    await expect(new BrowserLocalFileByteReader().read(file)).rejects.toMatchObject({
      message: 'Could not read song.mid.',
      cause,
    })
  })

  it('rejects a read that returns fewer bytes than the file holds', async () => {
    const truncated = {
      name: 'truncated.mid',
      size: 2,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
    } as unknown as Blob

    await expect(new BrowserLocalFileByteReader().read(truncated)).rejects.toThrowError(
      'Reading truncated.mid returned 1 bytes for a 2-byte file.',
    )
  })
})
