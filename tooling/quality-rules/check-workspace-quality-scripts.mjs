import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOL_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(TOOL_DIRECTORY, '../..')
const DELEGATED_SCRIPTS = Object.freeze({
  format: 'pnpm --workspace-root format',
  'format:check': 'pnpm --workspace-root format:check',
  lint: 'pnpm --workspace-root lint',
  'lint:fix': 'pnpm --workspace-root lint:fix',
})

async function readPackageJson(packageJsonPath) {
  return JSON.parse(await readFile(packageJsonPath, 'utf8'))
}

async function findWorkspacePackageJsonPaths() {
  const packageJsonPaths = []
  for (const workspaceDirectoryName of ['apps', 'packages']) {
    const workspaceDirectory = join(WORKSPACE_ROOT, workspaceDirectoryName)
    const entries = await readdir(workspaceDirectory, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      packageJsonPaths.push(join(workspaceDirectory, entry.name, 'package.json'))
    }
  }
  return packageJsonPaths.sort()
}

const rootPackageJson = await readPackageJson(join(WORKSPACE_ROOT, 'package.json'))
const failures = []

for (const scriptName of Object.keys(DELEGATED_SCRIPTS)) {
  if (typeof rootPackageJson.scripts?.[scriptName] !== 'string') {
    failures.push(`Root package is missing the ${scriptName} script`)
  }
}

for (const packageJsonPath of await findWorkspacePackageJsonPaths()) {
  const packageJson = await readPackageJson(packageJsonPath)
  const displayPath = relative(WORKSPACE_ROOT, packageJsonPath)
  for (const [scriptName, expectedCommand] of Object.entries(DELEGATED_SCRIPTS)) {
    const actualCommand = packageJson.scripts?.[scriptName]
    if (actualCommand !== expectedCommand) {
      failures.push(
        `${displayPath} must delegate ${scriptName} as "${expectedCommand}", received ${JSON.stringify(actualCommand)}`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('Workspace quality script consistency check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Workspace quality script consistency check passed.')
}
