import { runAudioQualityAq0BrowserBaseline } from '@seele-daw/audio-web/development/audio-quality-aq0'

import {
  createBuiltInScoreQualityMidiBytes,
  BUILT_IN_SCORE_QUALITY_FIXTURE_SCHEMA,
} from '@/development/built-in-score-quality/fixture'
import { runBuiltInScoreQualityBrowserReport } from '@/development/built-in-score-quality/browser-report'
import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'
import '../sample-instrument-audition/style.css'

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new TypeError(`required AQ0 element is missing: ${selector}`)
  return element
}

const status = requiredElement<HTMLOutputElement>('#run-status')
const output = requiredElement<HTMLElement>('#report-output')
const runButton = requiredElement<HTMLButtonElement>('#run-baseline')
const copyButton = requiredElement<HTMLButtonElement>('#copy-report')
const scoreOutput = requiredElement<HTMLElement>('#score-report-output')
const runScoreButton = requiredElement<HTMLButtonElement>('#run-score-report')
const copyScoreButton = requiredElement<HTMLButtonElement>('#copy-score-report')
let serializedReport: string | null = null
let serializedScoreReport: string | null = null

function setStatus(message: string, kind: 'busy' | 'error' | 'idle' | 'ready'): void {
  status.textContent = message
  status.dataset.kind = kind
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

runButton.addEventListener('click', () => {
  void (async () => {
    runButton.disabled = true
    copyButton.disabled = true
    setStatus('正在离线渲染 Velocity、Envelope、Loop、复音与 CC64 表达力压力输入…', 'busy')
    try {
      const report = await runAudioQualityAq0BrowserBaseline()
      serializedReport = JSON.stringify(report, null, 2)
      output.textContent = serializedReport
      copyButton.disabled = false
      const hardChecksPass = Object.values(report.checks).every(Boolean)
      setStatus(
        hardChecksPass ? 'V1A + Expression EQ2 综合检查通过' : '综合报告包含未通过检查',
        hardChecksPass ? 'ready' : 'error',
      )
    } catch (error) {
      serializedReport = null
      output.textContent = describeError(error)
      setStatus('V1A + Expression EQ2 综合检查失败', 'error')
    } finally {
      runButton.disabled = false
    }
  })()
})

copyButton.addEventListener('click', () => {
  void (async () => {
    if (serializedReport === null) return
    try {
      await navigator.clipboard.writeText(`${serializedReport}\n`)
      setStatus('V1A + Expression EQ2 报告 JSON 已复制', 'ready')
    } catch (error) {
      setStatus(`复制失败：${describeError(error)}`, 'error')
    }
  })()
})

runScoreButton.addEventListener('click', () => {
  void (async () => {
    runScoreButton.disabled = true
    copyScoreButton.disabled = true
    setStatus('正在加载七个本地音源并离线渲染 MI5 最小总谱…', 'busy')
    try {
      const report = await runBuiltInScoreQualityBrowserReport({
        expectedOrigin: location.origin,
      })
      serializedScoreReport = JSON.stringify(report, null, 2)
      scoreOutput.textContent = serializedScoreReport
      copyScoreButton.disabled = false
      const hardChecksPass = Object.values(report.checks).every(Boolean)
      setStatus(
        hardChecksPass ? 'MI5 真实音源总谱 PCM 检查通过' : 'MI5 总谱报告包含未通过检查',
        hardChecksPass ? 'ready' : 'error',
      )
    } catch (error) {
      serializedScoreReport = null
      scoreOutput.textContent = describeError(error)
      setStatus('MI5 真实音源总谱 PCM 检查失败', 'error')
    } finally {
      runScoreButton.disabled = false
    }
  })()
})

copyScoreButton.addEventListener('click', () => {
  void (async () => {
    if (serializedScoreReport === null) return
    try {
      await navigator.clipboard.writeText(`${serializedScoreReport}\n`)
      setStatus('MI5 总谱报告 JSON 已复制', 'ready')
    } catch (error) {
      setStatus(`复制失败：${describeError(error)}`, 'error')
    }
  })()
})

requiredElement<HTMLButtonElement>('#download-score-midi').addEventListener('click', () => {
  const bytes = createBuiltInScoreQualityMidiBytes()
  const payload = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(payload).set(bytes)
  const url = URL.createObjectURL(new Blob([payload], { type: 'audio/midi' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'seele-mi5-multi-instrument-quality-score.mid'
  anchor.click()
  URL.revokeObjectURL(url)
  setStatus('MI5 最小总谱 MIDI 已生成', 'ready')
})

requiredElement<HTMLButtonElement>('#copy-score-review').addEventListener('click', () => {
  void (async () => {
    try {
      const reviewStatus = requiredElement<HTMLSelectElement>('#score-review-status').value
      const observations = {
        attackAndTimbreMapping: requiredElement<HTMLTextAreaElement>(
          '#score-attack-observation',
        ).value.trim(),
        drumTailAndHiHatChoke:
          requiredElement<HTMLTextAreaElement>('#score-drum-observation').value.trim(),
        keyReleaseAndPedal: requiredElement<HTMLTextAreaElement>(
          '#score-release-observation',
        ).value.trim(),
        loopSeams: requiredElement<HTMLTextAreaElement>('#score-loop-observation').value.trim(),
        panAndSectionBalance: requiredElement<HTMLTextAreaElement>(
          '#score-balance-observation',
        ).value.trim(),
      }
      if (
        reviewStatus !== 'not-run' &&
        Object.values(observations).some((observation) => observation.length === 0)
      ) {
        throw new TypeError('通过或失败的听测记录必须填写全部观察项')
      }
      const review = Object.freeze({
        browser: navigator.userAgent,
        fixtureSchema: BUILT_IN_SCORE_QUALITY_FIXTURE_SCHEMA,
        observations,
        schema: 'seele.local-built-in-score-listening-review',
        schemaVersion: 1,
        status: reviewStatus,
      })
      await navigator.clipboard.writeText(`${JSON.stringify(review, null, 2)}\n`)
      setStatus('MI5 人工听测记录 JSON 已复制', 'ready')
    } catch (error) {
      setStatus(`听测记录失败：${describeError(error)}`, 'error')
    }
  })()
})
