const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const androidRoot = path.join(root, 'android')
const releaseRoot = path.join(root, 'release')
const roles = [
  { flavor: 'admin', title: 'Admin' },
  { flavor: 'teacher', title: 'Teacher' },
  { flavor: 'student', title: 'Student' },
  { flavor: 'creator', title: 'Creator', url: 'https://exam.timpriestedu.name.ng/creator' },
  { flavor: 'prep', title: 'Prep', url: 'https://exam.timpriestedu.name.ng/prep' },
  { flavor: 'ambassador', title: 'Ambassador', url: 'https://exam.timpriestedu.name.ng/prep/ambassador' }
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

function buildRole(role) {
  const env = {
    ...process.env,
    VITE_APP_ROLE: role.title,
    CAPACITOR_SERVER_URL: role.url || `https://exam.timpriestedu.name.ng/cbt?appRole=${role.title.toLowerCase()}`
  }
  run('npm', ['run', 'build'], { env })
  run('npx', ['cap', 'sync', 'android'], { env })

  const task = `assemble${role.title}Debug`
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [task, '--no-daemon'], { cwd: androidRoot })

  const apk = path.join(androidRoot, 'app', 'build', 'outputs', 'apk', role.flavor, 'debug', `app-${role.flavor}-debug.apk`)
  if (!fs.existsSync(apk)) throw new Error(`Gradle succeeded but did not produce ${apk}`)
  fs.mkdirSync(releaseRoot, { recursive: true })
  const output = path.join(releaseRoot, `TIMPRIEST EDU ${role.title}.apk`)
  fs.copyFileSync(apk, output)
  console.log(`Created ${path.relative(root, output)}`)
}

try {
  const requestedRole = process.argv[2]?.toLowerCase()
  const selectedRoles = requestedRole ? roles.filter((role) => role.flavor === requestedRole) : roles
  if (!selectedRoles.length) throw new Error(`Unknown Android role "${requestedRole}". Choose admin, teacher, student, creator, prep, or ambassador.`)
  for (const role of selectedRoles) buildRole(role)
} finally {
  const env = { ...process.env }
  delete env.VITE_APP_ROLE
  delete env.CAPACITOR_SERVER_URL
  run('npm', ['run', 'build'], { env })
  run('npx', ['cap', 'sync', 'android'], { env })
}
