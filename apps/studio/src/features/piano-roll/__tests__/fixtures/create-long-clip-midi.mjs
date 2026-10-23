import { writeFile } from 'node:fs/promises'

// A deterministic manual browser fixture: 280 bars, 4,480 notes, MIDI 48–72, no controllers.
function variableLength(value) {
  const bytes = [value & 0x7f]
  for (let remaining = value >>> 7; remaining > 0; remaining >>>= 7)
    bytes.unshift((remaining & 0x7f) | 0x80)
  return bytes
}

const name = Buffer.from('Perf 280 bars - 4480 notes')
const events = [{ tick: 0, bytes: [0xff, 0x03, ...variableLength(name.length), ...name] }]
for (let bar = 0; bar < 280; bar += 1) {
  for (let step = 0; step < 16; step += 1) {
    const tick = bar * 1920 + step * 120
    const pitch = 48 + ((step + bar) % 25)
    events.push({ tick, bytes: [0x90, pitch, 96] }, { tick: tick + 100, bytes: [0x80, pitch, 0] })
  }
}
events.push({ tick: 280 * 1920, bytes: [0xff, 0x2f, 0x00] })
events.sort((left, right) => left.tick - right.tick)
let previousTick = 0
const track = Buffer.from(
  events.flatMap(({ tick, bytes }) => {
    const delta = variableLength(tick - previousTick)
    previousTick = tick
    return [...delta, ...bytes]
  }),
)
const trackHeader = Buffer.alloc(8)
trackHeader.write('MTrk')
trackHeader.writeUInt32BE(track.length, 4)
const header = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0])
await writeFile(
  process.argv[2] ?? '/tmp/seele-perf-280.mid',
  Buffer.concat([header, trackHeader, track]),
)
