import { runAudioQualityAq0BrowserBaseline } from '@seele-daw/audio-web/development/audio-quality-aq0'

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
let serializedReport: string | null = null

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
    setStatus('正在离线渲染 Velocity、Envelope、Loop 与触发压力输入…', 'busy')
    try {
      const report = await runAudioQualityAq0BrowserBaseline()
      serializedReport = JSON.stringify(report, null, 2)
      output.textContent = serializedReport
      copyButton.disabled = false
      const hardChecksPass = Object.values(report.checks).every(Boolean)
      setStatus(
        hardChecksPass ? 'AQ2 浏览器检查通过' : 'AQ2 报告包含未通过检查',
        hardChecksPass ? 'ready' : 'error',
      )
    } catch (error) {
      serializedReport = null
      output.textContent = describeError(error)
      setStatus('AQ2 浏览器检查失败', 'error')
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
      setStatus('AQ2 报告 JSON 已复制', 'ready')
    } catch (error) {
      setStatus(`复制失败：${describeError(error)}`, 'error')
    }
  })()
})
