import path from 'node:path'

const keyboardPath = 'apps/studio/src/workbench/keyboard'
// Contracts hold shared types and ports, runtime owns Studio's keyboard policy, and browser
// adapts TanStack and storage. The two implementation layers meet only through contracts.
const layerDependencies = new Map([
  ['contracts', new Set(['contracts'])],
  ['runtime', new Set(['contracts', 'runtime'])],
  ['browser', new Set(['contracts', 'browser'])],
  ['index', new Set(['contracts', 'runtime'])],
  ['setup', new Set(['contracts', 'runtime', 'browser'])],
])

function relativeToRoot(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function isKeyboardFile(relative) {
  return relative === keyboardPath || relative.startsWith(`${keyboardPath}/`)
}

function modulePath(file) {
  return file.replace(/\.(?:[cm]?[jt]sx?|vue)$/, '')
}

/** Paths are already resolved from workspace aliases, relative imports or absolute imports. */
export function studioKeyboardImportViolation(root, file, target) {
  if (!target) return null
  const sourcePath = relativeToRoot(root, file)
  const targetPath = modulePath(relativeToRoot(root, target))
  if (!isKeyboardFile(targetPath) || sourcePath.includes('/__tests__/')) return null

  const entry = targetPath.slice(keyboardPath.length).replace(/^\//, '')
  const publicEntry = entry === '' || entry === 'index'
  const setupEntry = entry === 'setup'

  if (!isKeyboardFile(sourcePath)) {
    if (publicEntry) return null
    if (setupEntry && sourcePath.startsWith('apps/studio/src/bootstrap/')) return null
    return 'Keyboard 模块外只能导入 @/workbench/keyboard；仅 Studio bootstrap 可导入 /setup'
  }

  if (publicEntry || setupEntry)
    return 'Keyboard 内部必须直接引用所属文件，不能反向导入 index 或 setup 入口'

  const sourceLayer = modulePath(sourcePath)
    .slice(keyboardPath.length + 1)
    .split('/')[0]
  const targetLayer = entry.split('/')[0]
  if (!layerDependencies.get(sourceLayer)?.has(targetLayer))
    return `Keyboard ${sourceLayer} 不允许依赖 ${targetLayer}；共享契约应归入 contracts`
  return null
}
