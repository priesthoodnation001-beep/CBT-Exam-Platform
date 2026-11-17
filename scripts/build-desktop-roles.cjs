const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { build } = require('electron-builder')

const root = path.join(__dirname, '..')
const releaseRoot = path.join(root, 'release')
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timpriest-desktop-'))
const roles = [
  { id: 'admin', title: 'Admin' },
  { id: 'teacher', title: 'Teacher' },
  { id: 'student', title: 'Student' }
]

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

function runNpm(args, env) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, ...args], env)
    return
  }
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

async function buildRole(role) {
  runNpm(['run', 'build'], { ...process.env, VITE_APP_ROLE: role.title })
  const outputDir = path.join(outputRoot, role.id)
  const artifactName = `TIMPRIEST EDU ${role.title} Setup.\${ext}`
  const artifacts = await build({
    projectDir: root,
    config: {
      ...require(path.join(root, 'package.json')).build,
      appId: `edu.timpriest.cbt.${role.id}`,
      productName: `TIMPRIEST EDU ${role.title}`,
      directories: { ...require(path.join(root, 'package.json')).build.directories, output: outputDir },
      extraMetadata: { desktopRole: role.title },
      nsis: {
        ...require(path.join(root, 'package.json')).build.nsis,
        artifactName
      }
    }
  })
  const installer = artifacts.find((file) => path.basename(file) === artifactName.replace('${ext}', 'exe'))
  if (!installer || !fs.existsSync(installer)) {
    throw new Error(`electron-builder succeeded but did not produce the ${role.title} installer`)
  }
  fs.mkdirSync(releaseRoot, { recursive: true })
  const destination = path.join(releaseRoot, `TIMPRIEST EDU ${role.title} Setup.exe`)
  fs.copyFileSync(installer, destination)
  console.log(`Created ${path.relative(root, destination)}`)
}

async function main() {
  const baseEnv = { ...process.env }
  delete baseEnv.VITE_APP_ROLE
  try {
    for (const role of roles) await buildRole(role)
  } finally {
    try {
      runNpm(['run', 'build'], baseEnv)
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
