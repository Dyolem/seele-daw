import path from 'node:path'

const keyboardPath = 'apps/studio/src/workbench/keyboard'
const layerDependencies = new Map([
  ['contracts', new Set(['contracts'])],
  ['keymap', new Set(['contracts', 'keymap'])],
  ['runtime', new Set(['contracts', 'keymap', 'runtime'])],
  ['browser', new Set(['contracts', 'browser'])],
  ['vue', new Set(['contracts', 'runtime', 'vue'])],
  ['index', new Set(['contracts', 'keymap'])],
  ['setup', new Set(['contracts', 'keymap', 'runtime', 'browser', 'vue'])],
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
  if (targetPath.includes('/__tests__/')) return 'Keyboard 生产源码禁止导入测试支持代码'

  const entry = targetPath.slice(keyboardPath.length).replace(/^\//, '')
  const publicEntry = entry === '' || entry === 'index'
  const setupEntry = entry === 'setup'
  const sourceModule = modulePath(sourcePath).slice(keyboardPath.length + 1)

  if (!isKeyboardFile(sourcePath)) {
    if (publicEntry) return null
    if (setupEntry && sourcePath.startsWith('apps/studio/src/bootstrap/')) return null
    return 'Keyboard 模块外只能导入 @/workbench/keyboard；仅 Studio bootstrap 可导入 /setup'
  }

  if (publicEntry || setupEntry)
    return 'Keyboard 内部必须直接引用所属文件，不能反向导入 index 或 setup 入口'

  const sourceLayer = sourceModule.split('/')[0]
  const targetLayer = entry.split('/')[0]
  if (!layerDependencies.get(sourceLayer)?.has(targetLayer))
    return `Keyboard ${sourceLayer} 不允许依赖 ${targetLayer}；共享契约应归入 contracts`
  return null
}

export function studioKeyboardFileViolation(root, file, source) {
  const relative = relativeToRoot(root, file)
  if (!isKeyboardFile(relative) || relative.includes('/__tests__/')) return null
  if (path.posix.dirname(relative) !== keyboardPath) return null
  if (!['index.ts', 'setup.ts'].includes(path.posix.basename(relative)))
    return 'Keyboard 根层只保留 index.ts 与 setup.ts；实现应归入对应职责目录'
  if (/\bexport\s+(?:type\s+)?\*/.test(source))
    return 'Keyboard 入口必须明确列出导出项，不能使用 export *'
  return null
}
