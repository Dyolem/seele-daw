import path from 'node:path'

const editorCommon = 'packages/editor/src/common/'
const common = `${editorCommon}interaction/`
const browser = 'packages/editor/src/browser/interaction/'
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/')

/** The neutral protocol must not acquire an editor domain through direct or barrel imports. */
export function editorInteractionImportViolation(root, file, target, specifier) {
  const source = relative(root, file)
  if (!source.startsWith(common) && !source.startsWith(browser)) return null
  const destination = target ? relative(root, target) : specifier
  if (destination.startsWith(common)) return null
  if (source.startsWith(browser) && destination.startsWith(browser)) return null
  return 'Editor Interaction 中立层只能依赖自身；Browser Input 可单向依赖 Common Interaction'
}

/** All of editor `common/` stays platform-free; the DOM belongs to `browser/`. */
export function editorInteractionFileViolation(root, file, source) {
  const path = relative(root, file)
  if (!path.startsWith(editorCommon) || path.includes('/__tests__/')) return null
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  if (/\b(?:window|document|HTMLElement|PointerEvent|KeyboardEvent|MouseEvent)\b/.test(code))
    return 'Editor common 禁止使用 DOM 事件或浏览器对象；浏览器适配放在 browser/'
  return null
}
