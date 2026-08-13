import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const studioDist = resolve(repositoryRoot, 'apps/studio/dist')
const forbiddenPaths = [
  resolve(studioDist, 'soundbanks'),
  resolve(studioDist, 'sample-instrument-audition.html'),
]
const searchableExtensions = new Set(['.css', '.html', '.js', '.json', '.map'])
const forbiddenDevelopmentMarkers = [
  'seele.local-sample-instrument-listening-review',
  'seele-sample-instrument-asset-base',
]

const pathExists = async (path) => {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function collectSearchableFiles(directory) {
  if (!(await pathExists(directory))) return []
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectSearchableFiles(path)))
    else if (entry.isFile() && searchableExtensions.has(extname(entry.name))) files.push(path)
  }
  return files
}

const failures = []
for (const forbiddenPath of forbiddenPaths) {
  if (await pathExists(forbiddenPath)) failures.push(relative(repositoryRoot, forbiddenPath))
}
for (const file of await collectSearchableFiles(studioDist)) {
  const contents = await readFile(file, 'utf8')
  for (const marker of forbiddenDevelopmentMarkers) {
    if (contents.includes(marker)) {
      failures.push(`${relative(repositoryRoot, file)} contains development marker ${marker}`)
    }
  }
}

if (failures.length === 0) {
  console.log('Studio distributable local-audio boundary passed.')
} else {
  const failureList = failures.map((failure) => `- ${failure}`).join('\n')

  console.error(
    [
      'Studio distributable local-audio boundary failed:',
      failureList,
      'Keep Vite build.copyPublicDir disabled while public/soundbanks contains local validation assets.',
      'Raw soundbanks and the development audition surface must not enter a distributable build.',
    ].join('\n'),
  )

  process.exitCode = 1
}
