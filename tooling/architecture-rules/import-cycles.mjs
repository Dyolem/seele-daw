const importStatement =
  /(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * The module specifiers a source file loads at runtime. `import type` and `export type`
 * statements are erased by the compiler, so they are not edges.
 */
export function runtimeImportsFrom(source) {
  const specifiers = new Set()
  for (const match of source.matchAll(importStatement)) {
    if (match[1] === undefined) specifiers.add(match[2] ?? match[3])
  }
  return specifiers
}

/**
 * Groups of nodes that reach each other, in a graph given as node → the nodes it points to.
 * A node pointing to itself is not a cycle here.
 */
export function findCycles(graph) {
  const cycles = []
  const state = new Map()
  const stack = []
  let nextIndex = 0

  const visit = (node) => {
    const info = { index: nextIndex, low: nextIndex, onStack: true }
    nextIndex += 1
    state.set(node, info)
    stack.push(node)

    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next) || next === node) continue
      const seen = state.get(next)
      if (seen === undefined) {
        visit(next)
        info.low = Math.min(info.low, state.get(next).low)
      } else if (seen.onStack) {
        info.low = Math.min(info.low, seen.index)
      }
    }

    if (info.low !== info.index) return
    const members = []
    let member
    do {
      member = stack.pop()
      state.get(member).onStack = false
      members.push(member)
    } while (member !== node)
    if (members.length > 1) cycles.push(members.sort())
  }

  for (const node of graph.keys()) if (!state.has(node)) visit(node)
  return cycles
}
