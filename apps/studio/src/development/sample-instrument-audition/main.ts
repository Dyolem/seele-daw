import {
  SampleInstrumentAuditionError,
  createSampleInstrumentAuditionSession,
  type SampleInstrumentAuditionNoteOffMode,
  type SampleInstrumentAuditionVelocityCurve,
  type SampleInstrumentBrowserLoadMeasurement,
} from '@seele-daw/audio-web/development/sample-instrument-audition'

import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'
import './style.css'

interface LoadingEstimateSummary {
  readonly fullInstrument: {
    readonly decodedFloat32ByteLength: number
    readonly encodedByteLength: number
    readonly maximumSourceDurationSecond: number
    readonly minimumSourceDurationSecond: number
    readonly resourceCount: number
  }
  readonly manifest: { readonly sha256: string }
  readonly referenceInitialWindow: {
    readonly decodedFloat32ByteLength: number
    readonly encodedByteLength: number
    readonly resourceCount: number
  }
  readonly schema: 'seele.local-sample-instrument-loading-estimate'
  readonly schemaVersion: 1
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new TypeError(`required audition element is missing: ${selector}`)
  return element
}

function requiredMeta(name: string): URL {
  const content = requiredElement<HTMLMetaElement>(`meta[name="${name}"]`).content
  return new URL(content, document.baseURI)
}

function formatMebibytes(byteLength: number): string {
  return `${(byteLength / 1_048_576).toFixed(2)} MiB`
}

function parsePitchList(input: string): readonly number[] {
  const pitches = input
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => !Number.isNaN(value))
  if (
    pitches.length === 0 ||
    pitches.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)
  ) {
    throw new TypeError('参考窗口必须是以逗号分隔的 MIDI pitch 0...127')
  }
  return Object.freeze(pitches)
}

function assertLoadingEstimate(input: unknown): asserts input is LoadingEstimateSummary {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('schema' in input) ||
    input.schema !== 'seele.local-sample-instrument-loading-estimate' ||
    !('schemaVersion' in input) ||
    input.schemaVersion !== 1 ||
    !('manifest' in input) ||
    !('fullInstrument' in input) ||
    !('referenceInitialWindow' in input)
  ) {
    throw new TypeError('loading estimate does not match the development schema')
  }
}

const status = requiredElement<HTMLOutputElement>('#session-status')
const browserOutput = requiredElement<HTMLElement>('#browser-measurement-output')
const auditionOutput = requiredElement<HTMLElement>('#audition-output')
const decodedCacheCount = requiredElement<HTMLElement>('#decoded-cache-count')
const assetBaseUrl = requiredMeta('seele-sample-instrument-asset-base')
const estimateUrl = requiredMeta('seele-sample-instrument-loading-estimate')
const session = createSampleInstrumentAuditionSession({
  assetBaseUrl,
  expectedOrigin: location.origin,
})

function setStatus(message: string, kind: 'busy' | 'error' | 'idle' | 'ready'): void {
  status.textContent = message
  status.dataset.kind = kind
}

function updateCacheCount(): void {
  decodedCacheCount.textContent = `${session.decodedResourceCount} decoded`
}

function describeError(error: unknown): string {
  if (error instanceof SampleInstrumentAuditionError) return `${error.code}: ${error.detail}`
  return error instanceof Error ? error.message : String(error)
}

function measurementSummary(measurement: SampleInstrumentBrowserLoadMeasurement) {
  return {
    resourceCount: measurement.resourceCount,
    cacheHitCount: measurement.cacheHitCount,
    encoded: formatMebibytes(measurement.encodedByteLength),
    decodedFloat32: formatMebibytes(measurement.decodedFloat32ByteLength),
    wallDurationMillisecond: Number(measurement.wallDurationMillisecond.toFixed(2)),
    summedFetchMillisecond: Number(
      measurement.resources
        .reduce((total, resource) => total + resource.fetchDurationMillisecond, 0)
        .toFixed(2),
    ),
    summedDecodeMillisecond: Number(
      measurement.resources
        .reduce((total, resource) => total + resource.decodeDurationMillisecond, 0)
        .toFixed(2),
    ),
  }
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    setStatus(describeError(error), 'error')
  } finally {
    updateCacheCount()
  }
}

async function loadStaticEstimate(): Promise<void> {
  const response = await fetch(estimateUrl, { cache: 'no-store' })
  if (!response.ok) throw new TypeError(`loading estimate request failed: HTTP ${response.status}`)
  const estimate: unknown = await response.json()
  assertLoadingEstimate(estimate)
  requiredElement('#manifest-digest').textContent =
    `Manifest ${estimate.manifest.sha256.slice(0, 12)}…`
  requiredElement('#full-resource-count').textContent =
    `${estimate.fullInstrument.resourceCount} WAV`
  requiredElement('#full-resource-size').textContent =
    `${formatMebibytes(estimate.fullInstrument.encodedByteLength)} encoded · ` +
    `${formatMebibytes(estimate.fullInstrument.decodedFloat32ByteLength)} decoded`
  requiredElement('#window-resource-count').textContent =
    `${estimate.referenceInitialWindow.resourceCount} WAV`
  requiredElement('#window-resource-size').textContent =
    `${formatMebibytes(estimate.referenceInitialWindow.encodedByteLength)} encoded · ` +
    `${formatMebibytes(estimate.referenceInitialWindow.decodedFloat32ByteLength)} decoded`
  requiredElement('#sample-duration-range').textContent =
    `${estimate.fullInstrument.minimumSourceDurationSecond.toFixed(2)}–` +
    `${estimate.fullInstrument.maximumSourceDurationSecond.toFixed(2)} s`
}

requiredElement<HTMLButtonElement>('#activate-audio').addEventListener('click', () => {
  void runAction(async () => {
    setStatus('正在激活 AudioContext…', 'busy')
    const contextState = await session.activateAudio()
    setStatus(`AudioContext ${contextState}`, 'ready')
  })
})

requiredElement<HTMLButtonElement>('#measure-window').addEventListener('click', () => {
  void runAction(async () => {
    setStatus('正在读取并解码参考窗口…', 'busy')
    const pitches = parsePitchList(requiredElement<HTMLInputElement>('#window-pitches').value)
    const measurement = await session.measurePitches(pitches)
    browserOutput.textContent = JSON.stringify(
      { kind: 'reference-window', pitches, ...measurementSummary(measurement) },
      null,
      2,
    )
    setStatus('参考窗口测量完成', 'ready')
  })
})

requiredElement<HTMLButtonElement>('#measure-full').addEventListener('click', () => {
  void runAction(async () => {
    setStatus('正在读取并解码完整音源…', 'busy')
    const measurement = await session.measureAllResources()
    browserOutput.textContent = JSON.stringify(
      { kind: 'full-instrument', ...measurementSummary(measurement) },
      null,
      2,
    )
    setStatus('完整音源测量完成', 'ready')
  })
})

requiredElement<HTMLButtonElement>('#clear-cache').addEventListener('click', () => {
  session.stopAll()
  session.clearDecodedResources()
  browserOutput.textContent = 'Decoded cache 已清空；下一次测量会重新 Fetch / decode。'
  updateCacheCount()
  setStatus('缓存已清空', 'idle')
})

const noteOffMode = requiredElement<HTMLSelectElement>('#note-off-mode')
const releaseDuration = requiredElement<HTMLInputElement>('#release-duration')
noteOffMode.addEventListener('change', () => {
  releaseDuration.disabled = noteOffMode.value === 'natural-end'
})

for (const preset of document.querySelectorAll<HTMLButtonElement>('.preset')) {
  preset.addEventListener('click', () => {
    requiredElement<HTMLInputElement>('#pitch').value = preset.dataset.pitch ?? '60'
    requiredElement<HTMLInputElement>('#note-duration').value = preset.dataset.duration ?? '0.25'
  })
}

requiredElement<HTMLButtonElement>('#audition-note').addEventListener('click', () => {
  void runAction(async () => {
    setStatus('正在准备试听 Note…', 'busy')
    const result = await session.auditionNote({
      durationSecond: requiredElement<HTMLInputElement>('#note-duration').valueAsNumber,
      noteOffMode: noteOffMode.value as SampleInstrumentAuditionNoteOffMode,
      pitch: requiredElement<HTMLInputElement>('#pitch').valueAsNumber,
      releaseSecond: releaseDuration.valueAsNumber,
      velocity: requiredElement<HTMLInputElement>('#velocity').valueAsNumber,
      velocityCurve: requiredElement<HTMLSelectElement>('#velocity-curve')
        .value as SampleInstrumentAuditionVelocityCurve,
    })
    auditionOutput.textContent = JSON.stringify(
      {
        ...result,
        effectiveNaturalEndSecond:
          result.effectiveNaturalEndSecond === null
            ? null
            : Number(result.effectiveNaturalEndSecond.toFixed(4)),
        playbackRate: Number(result.playbackRate.toFixed(6)),
        velocityGain: Number(result.velocityGain.toFixed(6)),
      },
      null,
      2,
    )
    setStatus('正在试听', 'ready')
  })
})

requiredElement<HTMLButtonElement>('#stop-all').addEventListener('click', () => {
  session.stopAll()
  setStatus('全部试听 Voice 已停止', 'idle')
})

requiredElement<HTMLButtonElement>('#copy-review').addEventListener('click', () => {
  void runAction(async () => {
    const review = {
      schema: 'seele.local-sample-instrument-listening-review',
      schemaVersion: 1,
      browser: navigator.userAgent,
      assetBaseUrl: session.assetBaseUrl,
      observations: {
        longNote: requiredElement<HTMLTextAreaElement>('#long-note-observation').value,
        shortNoteAndRelease: requiredElement<HTMLTextAreaElement>('#short-note-observation').value,
        velocityAndRealism: requiredElement<HTMLTextAreaElement>('#velocity-observation').value,
      },
    }
    await navigator.clipboard.writeText(`${JSON.stringify(review, null, 2)}\n`)
    setStatus('审阅 JSON 已复制', 'ready')
  })
})

window.addEventListener(
  'pagehide',
  () => {
    void session.dispose()
  },
  { once: true },
)

void runAction(async () => {
  await Promise.all([loadStaticEstimate(), session.loadManifest()])
  setStatus('Manifest 与静态预算已就绪；AudioContext 尚未创建', 'ready')
})
