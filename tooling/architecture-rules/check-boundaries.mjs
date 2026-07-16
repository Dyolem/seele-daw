import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const packageRoot = path.join(root, 'packages')
const packageNames = ['project-core', 'editor', 'playback', 'audio-web', 'platform-browser']
const workspaceDirectories = [
  path.join(root, 'apps', 'studio'),
  ...packageNames.map((packageName) => path.join(packageRoot, packageName)),
]
const allowedWorkspaceImports = new Map([
  ['project-core', new Set()],
  ['editor', new Set(['project-core'])],
  ['playback', new Set(['project-core'])],
  ['audio-web', new Set(['playback'])],
  ['platform-browser', new Set(['project-core', 'playback'])],
])

const bannedExternalImports = new Map([
  ['project-core', new Set(['vue', 'pinia', 'vue-router'])],
  ['editor', new Set(['vue', 'pinia', 'vue-router'])],
  ['playback', new Set(['vue', 'pinia', 'vue-router'])],
])

const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.vue'])
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage'])
const errors = []

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(absolutePath)))
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolutePath)
  }

  return files
}

function importsFrom(source) {
  const imports = new Set()
  const patterns = [/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g, /import\s*['"]([^'"]+)['"]/g]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.add(match[1])
  }

  return imports
}

function ownerOf(file) {
  const relative = path.relative(packageRoot, file)
  const [owner] = relative.split(path.sep)
  return packageNames.includes(owner) ? owner : undefined
}

function isInside(directory, target) {
  const relative = path.relative(directory, target)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

function workspaceDirectoryOf(file) {
  return workspaceDirectories.find((workspaceDirectory) => isInside(workspaceDirectory, file))
}

function workspaceAliasTarget(specifier, workspaceDirectory) {
  const match = /^[@~]\/(.+)$/.exec(specifier)
  return match ? path.resolve(workspaceDirectory, 'src', match[1]) : undefined
}

function workspacePackageOf(specifier) {
  const match = /^@seele-daw\/([^/]+)(?:\/(.+))?$/.exec(specifier)
  return match ? { name: match[1], deepPath: match[2] } : undefined
}

for (const file of await collectFiles(root)) {
  const owner = ownerOf(file)
  const workspaceDirectory = workspaceDirectoryOf(file)
  if (!workspaceDirectory) continue

  const source = await readFile(file, 'utf8')
  for (const specifier of importsFrom(source)) {
    const aliasTarget = workspaceAliasTarget(specifier, workspaceDirectory)

    if (aliasTarget) {
      const sourceDirectory = path.join(workspaceDirectory, 'src')
      if (!isInside(sourceDirectory, aliasTarget)) {
        errors.push(`${path.relative(root, file)}: 禁止用 @/ 或 ~/ 越过 workspace 源码边界`)
      }
      continue
    }

    if (!owner) continue

    const workspaceImport = workspacePackageOf(specifier)

    if (workspaceImport) {
      if (workspaceImport.deepPath) {
        errors.push(`${path.relative(root, file)}: 禁止绕过 ${workspaceImport.name} 的公开入口`)
      }

      if (!allowedWorkspaceImports.get(owner)?.has(workspaceImport.name)) {
        errors.push(`${path.relative(root, file)}: ${owner} 不允许依赖 ${workspaceImport.name}`)
      }
      continue
    }

    const externalRoot = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]
    if (bannedExternalImports.get(owner)?.has(externalRoot)) {
      errors.push(`${path.relative(root, file)}: ${owner} 禁止导入 ${externalRoot}`)
    }

    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(file), specifier)
      const ownerDirectory = path.join(packageRoot, owner)
      const relativeTarget = path.relative(ownerDirectory, target)
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        errors.push(`${path.relative(root, file)}: 禁止用相对路径跨越 package 边界`)
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`架构边界检查失败（${errors.length} 项）：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('架构边界检查通过。')
}
