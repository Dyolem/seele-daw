import path from 'node:path'

const registries = new Set([
  'apps/studio/src/symbols.ts',
  'packages/editor/src/common/interaction/interaction-symbols.ts',
  'packages/project-core/src/project-symbols.ts',
])

/** Symbol creation belongs to each owner's catalogue, never to arbitrary consumers. */
export function symbolFileViolation(root, file, source) {
  const relative = path.relative(root, file).split(path.sep).join('/')
  if (relative.includes('/__tests__/')) return null
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  if (/\bSymbol\s*\.\s*for\s*\(/u.test(code))
    return 'Symbol 不使用进程全局注册表；共享键集中声明，操作身份每次创建'
  if (!registries.has(relative) && /\bSymbol\s*\(/u.test(code))
    return 'Symbol 必须在所属包的集中注册文件中创建；消费者引用稳定键或身份工厂'
  if (registries.has(relative) && /\bimport\s+(?!type\b)(?:[\w*{]|['"])/u.test(code))
    return 'Symbol 注册文件只允许 type import，不能反向加载消费者的运行时实现'
  return null
}
