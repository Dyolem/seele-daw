import path from 'node:path'

const feature = 'apps/studio/src/features/piano-roll/'
const components = `${feature}components/`

function relativeToRoot(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

/** Inputs already resolve workspace aliases, relative imports and absolute paths. */
export function pianoRollImportViolation(root, file, target) {
  if (!target) return null
  const sourcePath = relativeToRoot(root, file)
  const targetPath = relativeToRoot(root, target)
  if (sourcePath.includes('/__tests__/')) return null

  if (targetPath.startsWith(feature) && targetPath.includes('/__tests__/'))
    return 'Piano Roll 生产代码禁止导入测试支持'

  if (targetPath.startsWith(components)) {
    const [owner, directory] = targetPath.slice(components.length).split('/')
    if (['hooks', 'types'].includes(directory) && !sourcePath.startsWith(`${components}${owner}/`))
      return 'Piano Roll 子模块的 hooks / types 属于私有实现；请使用组件或 feature 共享契约'
  }

  if (
    sourcePath.startsWith(feature) &&
    sourcePath.includes('/types/') &&
    targetPath.startsWith(feature) &&
    !targetPath.includes('/types/')
  )
    return 'Piano Roll 共享契约不能反向依赖组件、hook 或其他实现'

  return null
}
