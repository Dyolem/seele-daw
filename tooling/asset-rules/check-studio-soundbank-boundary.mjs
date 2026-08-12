import { access } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const forbiddenPath = resolve(repositoryRoot, 'apps/studio/dist/soundbanks')

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

if (!(await pathExists(forbiddenPath))) {
  console.log('Studio distributable soundbank boundary passed.')
} else {
  const forbiddenRelativePath = relative(repositoryRoot, forbiddenPath)

  console.error(
    [
      `Studio distributable soundbank boundary failed: ${forbiddenRelativePath} exists.`,
      'Keep Vite build.copyPublicDir disabled while public/soundbanks contains local validation assets.',
      'Raw soundbanks must not enter a distributable build.',
    ].join('\n'),
  )

  process.exitCode = 1
}
