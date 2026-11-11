import path from 'node:path'

const studioSource = 'apps/studio/src'
// A layer imports its own level and the ones below it. Files directly under src (App.vue,
// main.ts) assemble the application and sit above every directory.
const layerRanks = new Map([
  ['ui', 0],
  ['workbench', 1],
  ['features', 2],
  ['development', 2],
  ['router', 3],
  ['bootstrap', 4],
])
const rootRank = 5

function relativeToRoot(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function studioPath(root, file) {
  const relative = relativeToRoot(root, file)
  return relative.startsWith(`${studioSource}/`) ? relative.slice(studioSource.length + 1) : null
}

function layerOf(studioRelative) {
  const [first, second] = studioRelative.split('/')
  if (second === undefined) return { name: 'src', rank: rootRank }
  const rank = layerRanks.get(first)
  return rank === undefined ? null : { name: first, rank }
}

/** The feature directory a Studio file belongs to, e.g. "piano-roll"; null outside features. */
export function studioFeatureOf(root, file) {
  const relative = studioPath(root, file)
  if (relative === null) return null
  const [first, second, third] = relative.split('/')
  return first === 'features' && third !== undefined ? second : null
}

/** Paths are already resolved from workspace aliases or relative imports. */
export function studioLayerImportViolation(root, file, target) {
  if (!target) return null
  const source = studioPath(root, file)
  const imported = studioPath(root, target)
  if (source === null || imported === null || source.includes('__tests__/')) return null

  const sourceLayer = layerOf(source)
  const targetLayer = layerOf(imported)
  if (sourceLayer === null || targetLayer === null) return null
  if (sourceLayer.rank >= targetLayer.rank) return null
  return `Studio 的 ${sourceLayer.name} 不能导入 ${targetLayer.name}：下层不导入上层，共用的东西下沉`
}
