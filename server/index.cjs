const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const initSqlJs = require('sql.js')

const PORT = Number(process.env.PORT || 8787)
const DATA_DIR = process.env.CBT_DATA_DIR || path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'timpriest-v2.sqlite')
const CLIENT_DIR = path.join(__dirname, '..', 'dist')
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const RESERVED_SLUGS = new Set(['api', 'assets', 'admin', 'login', 'register', 'static', 'favicon.ico'])
const app = express()
const attempts = new Map()
let db

app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})

/* ---------- helpers ---------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
}

function verifyPassword(password, stored) {
  const [salt, digest] = String(stored || '').split(':')
  if (!salt || !digest) return false
  const expected = Buffer.from(crypto.scryptSync(password, salt, 64).toString('hex'), 'hex')
  const actual = Buffer.from(digest, 'hex')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function rows(sql, values = []) {
  const statement = db.prepare(sql)
  statement.bind(values)
  const result = []
  while (statement.step()) result.push(statement.getAsObject())
  statement.free()
  return result
}

function run(sql, values = []) {
  db.run(sql, values)
  persist()
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const temp = `${DB_FILE}.tmp`
  fs.writeFileSync(temp, Buffer.from(db.export()))
  fs.renameSync(temp, DB_FILE)
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    username: user.username || undefined,
    studentId: user.student_id || undefined,
    classSection: user.class_section || undefined,
    schoolName: user.school_name || undefined,
    schoolSlug: user.school_slug || undefined
  }
}

function publicQuestion(question, includeAnswer = false) {
  const result = { id: question.id, examId: question.exam_id, subject: question.subject, text: question.text, options: JSON.parse(question.options) }
  if (includeAnswer) result.answer = Number(question.answer)
  return result
}

function loadUser(id) {
  return rows(
    'SELECT users.*, schools.name AS school_name, schools.slug AS school_slug FROM users JOIN schools ON schools.id = users.school_id WHERE users.id = ? AND users.deleted = 0',
    [id]
  ).at(0)
}

function makeSlug(name) {
  let base = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  if (!base || RESERVED_SLUGS.has(base)) base = `${base || 'school'}-school`
  let slug = base
  let count = 2
  while (rows('SELECT id FROM schools WHERE slug = ?', [slug]).length) slug = `${base}-${count++}`
  return slug
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), userId, Date.now() + SESSION_MS])
  return token
}

function tooManyAttempts(key) {
  const entry = attempts.get(key)
  if (!entry) return false
  if (Date.now() - entry.first > 15 * 60 * 1000) { attempts.delete(key); return false }
  return entry.count >= 10
}

function recordFailure(key) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.first > 15 * 60 * 1000) attempts.set(key, { count: 1, first: Date.now() })
  else entry.count += 1
}

function authenticate(request, response, next) {
  const token = String(request.headers.authorization || '').replace('Bearer ', '')
  const session = token ? rows('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', [hashToken(token), Date.now()]).at(0) : undefined
  const user = session ? loadUser(session.user_id) : undefined
  if (!user) return response.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  request.user = { ...publicUser(user), schoolId: user.school_id }
  request.token = token
  next()
}

function requireRole(...roles) {
  return (request, response, next) => roles.includes(request.user.role) ? next() : response.status(403).json({ error: 'You do not have permission for this action.' })
}

/* ---------- public routes ---------- */

app.get('/api/health', (_request, response) => response.json({ ok: true, database: 'SQLite', name: 'TIMPRIEST EDU' }))

app.get('/api/schools/:slug', (request, response) => {
  const school = rows('SELECT name, slug FROM schools WHERE slug = ?', [String(request.params.slug).toLowerCase()]).at(0)
  if (!school) return response.status(404).json({ error: 'School not found.' })
  response.json(school)
})

app.post('/api/register-admin', (request, response) => {
  const { schoolName, name, username, password } = request.body || {}
  if (!schoolName || String(schoolName).trim().length < 2) return response.status(400).json({ error: 'Enter your school name.' })
  if (!name || !username || !password || String(password).length < 6) return response.status(400).json({ error: 'Name, username, and a password of at least 6 characters are required.' })
  if (rows('SELECT id FROM users WHERE lower(username) = lower(?) AND deleted = 0', [String(username).trim()]).length) return response.status(409).json({ error: 'That username is already in use. Choose another one.' })
  const schoolId = crypto.randomUUID()
  const slug = makeSlug(schoolName)
  run('INSERT INTO schools (id, name, slug, created_at) VALUES (?, ?, ?, ?)', [schoolId, String(schoolName).trim(), slug, new Date().toISOString()])
  run('INSERT INTO users (id, school_id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, \'Admin\', ?, ?, ?, NULL, NULL, 0)', [crypto.randomUUID(), schoolId, String(name).trim(), String(username).trim(), hashPassword(String(password))])
  response.status(201).json({ school: { name: String(schoolName).trim(), slug } })
})

app.post('/api/login', (request, response) => {
  const { role, identifier = '', password = '', schoolSlug = '' } = request.body || {}
  const id = String(identifier).trim()
  if (!['Admin', 'Teacher', 'Student'].includes(role) || !id) return response.status(400).json({ error: 'Enter your sign-in details.' })
  const key = `${request.ip}|${id.toLowerCase()}`
  if (tooManyAttempts(key)) return response.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' })
  const school = schoolSlug ? rows('SELECT id FROM schools WHERE slug = ?', [String(schoolSlug).toLowerCase()]).at(0) : undefined
  let user
  if (role === 'Student') {
    if (!schoolSlug) return response.status(400).json({ error: 'Students must sign in from their school\'s own link.' })
    if (school) user = rows('SELECT * FROM users WHERE role = \'Student\' AND school_id = ? AND lower(student_id) = lower(?) AND deleted = 0', [school.id, id]).at(0)
  } else {
    user = rows('SELECT * FROM users WHERE role = ? AND lower(username) = lower(?) AND deleted = 0', [role, id]).at(0)
    if (user && schoolSlug && (!school || school.id !== user.school_id)) user = undefined
  }
  const valid = user && (role === 'Student' ? true : verifyPassword(String(password), user.password_hash))
  if (!valid) {
    recordFailure(key)
    return response.status(401).json({ error: role === 'Student' ? 'Student ID not found.' : 'Username or password is incorrect.' })
  }
  attempts.delete(key)
  const token = createSession(user.id)
  response.json({ token, user: publicUser(loadUser(user.id)) })
})

/* ---------- signed-in routes ---------- */

app.get('/api/me', authenticate, (request, response) => {
  const { schoolId, ...user } = request.user
  response.json({ user })
})

app.post('/api/logout', authenticate, (request, response) => {
  run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(request.token)])
  response.sendStatus(204)
})

app.post('/api/change-password', authenticate, requireRole('Admin', 'Teacher'), (request, response) => {
  const { currentPassword = '', newPassword = '' } = request.body || {}
  if (String(newPassword).length < 6) return response.status(400).json({ error: 'The new password must be at least 6 characters.' })
  const user = rows('SELECT * FROM users WHERE id = ?', [request.user.id]).at(0)
  if (!user || !verifyPassword(String(currentPassword), user.password_hash)) return response.status(400).json({ error: 'Your current password is incorrect.' })
  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(String(newPassword)), user.id])
  run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', [user.id, hashToken(request.token)])
  response.json({ message: 'Password changed.' })
})

app.get('/api/data', authenticate, (request, response) => {
  const schoolId = request.user.schoolId
  const isStudent = request.user.role === 'Student'
  const users = request.user.role === 'Admin'
    ? rows('SELECT * FROM users WHERE school_id = ? AND deleted = 0 AND role != \'Admin\' ORDER BY name', [schoolId]).map(publicUser)
    : []
  const subjects = rows('SELECT subject, duration, approved, approved_at FROM subject_settings WHERE school_id = ? ORDER BY subject', [schoolId])
  const exams = rows(
    `SELECT exams.id, exams.title, exams.subject, exams.date, exams.time, exams.duration, exams.questions, exams.status,
      COALESCE(subject_settings.duration, 30) AS subject_duration,
      COALESCE(subject_settings.approved, 0) AS subject_approved,
      (SELECT COUNT(*) FROM submissions WHERE submissions.exam_id = exams.id AND submissions.student_id = ?) AS taken
     FROM exams LEFT JOIN subject_settings ON subject_settings.subject = exams.subject AND subject_settings.school_id = exams.school_id
     WHERE exams.school_id = ? ORDER BY exams.date, exams.time`,
    [request.user.id, schoolId]
  )
  const questionSql = isStudent
    ? 'SELECT questions.id, questions.exam_id, questions.subject, questions.text, questions.options, questions.answer FROM questions JOIN subject_settings ON subject_settings.subject = questions.subject AND subject_settings.school_id = questions.school_id AND subject_settings.approved = 1 WHERE questions.school_id = ? ORDER BY questions.created_at'
    : 'SELECT id, exam_id, subject, text, options, answer FROM questions WHERE school_id = ? ORDER BY created_at'
  const questions = rows(questionSql, [schoolId]).map((question) => publicQuestion(question, !isStudent))
  const results = request.user.role === 'Admin'
    ? rows('SELECT submissions.id, submissions.score, submissions.total, submissions.submitted_at, exams.title AS exam_title, users.name AS student_name, users.student_id FROM submissions JOIN exams ON exams.id = submissions.exam_id JOIN users ON users.id = submissions.student_id WHERE submissions.school_id = ? ORDER BY submissions.submitted_at DESC', [schoolId])
    : []
  response.json({ users, exams, questions, results, subjects })
})

app.post('/api/users', authenticate, requireRole('Admin'), (request, response) => {
  const { role, name, username = '', password = '', studentId = '', classSection = '' } = request.body || {}
  const schoolId = request.user.schoolId
  if (!['Teacher', 'Student'].includes(role) || !name) return response.status(400).json({ error: 'Name and a valid role are required.' })
  if (role === 'Teacher' && (!username || String(password).length < 6)) return response.status(400).json({ error: 'Teacher username and a password of at least 6 characters are required.' })
  if (role === 'Student' && (!studentId || !classSection)) return response.status(400).json({ error: 'Student ID and class section are required.' })
  const duplicate = role === 'Student'
    ? rows('SELECT id FROM users WHERE school_id = ? AND lower(student_id) = lower(?) AND deleted = 0', [schoolId, studentId])
    : rows('SELECT id FROM users WHERE lower(username) = lower(?) AND deleted = 0', [username])
  if (duplicate.length) return response.status(409).json({ error: 'That login already exists.' })
  const id = crypto.randomUUID()
  run('INSERT INTO users (id, school_id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)', [id, schoolId, role, String(name).trim(), role === 'Teacher' ? String(username).trim() : null, role === 'Teacher' ? hashPassword(String(password)) : null, role === 'Student' ? String(studentId).trim().toUpperCase() : null, role === 'Student' ? String(classSection).trim() : null])
  response.status(201).json({ user: publicUser(rows('SELECT * FROM users WHERE id = ?', [id])[0]) })
})

app.delete('/api/users/:id', authenticate, requireRole('Admin'), (request, response) => {
  const target = rows('SELECT id FROM users WHERE id = ? AND school_id = ? AND role != \'Admin\' AND deleted = 0', [request.params.id, request.user.schoolId]).at(0)
  if (!target) return response.status(404).json({ error: 'User not found.' })
  run('UPDATE users SET deleted = 1 WHERE id = ?', [target.id])
  run('DELETE FROM sessions WHERE user_id = ?', [target.id])
  response.sendStatus(204)
})

app.post('/api/exams', authenticate, requireRole('Admin'), (request, response) => {
  const { title, subject, date, time, duration, questions } = request.body || {}
  if (!title || !subject || !date || !time) return response.status(400).json({ error: 'Title, subject, date, and time are required.' })
  const id = crypto.randomUUID()
  run('INSERT INTO exams (id, school_id, title, subject, date, time, duration, questions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'Scheduled\')', [id, request.user.schoolId, title, subject, date, time, Number(duration) || 90, Number(questions) || 0])
  response.status(201).json({ exam: rows('SELECT * FROM exams WHERE id = ?', [id])[0] })
})

app.delete('/api/exams/:id', authenticate, requireRole('Admin'), (request, response) => {
  const exam = rows('SELECT id FROM exams WHERE id = ? AND school_id = ? AND status IN (\'Draft\', \'Scheduled\', \'Published\')', [request.params.id, request.user.schoolId]).at(0)
  if (!exam) return response.status(404).json({ error: 'Exam not found or cannot be deleted.' })
  run('DELETE FROM submissions WHERE exam_id = ?', [exam.id])
  run('DELETE FROM questions WHERE exam_id = ?', [exam.id])
  run('DELETE FROM exams WHERE id = ?', [exam.id])
  response.sendStatus(204)
})

app.post('/api/subjects', authenticate, requireRole('Teacher'), (request, response) => {
  const { subject, duration } = request.body || {}
  const minutes = Number(duration)
  const name = String(subject || '').trim()
  if (!name || !Number.isInteger(minutes) || minutes < 1 || minutes > 30) return response.status(400).json({ error: 'Enter a subject name and a time between 1 and 30 minutes.' })
  run('INSERT INTO subject_settings (school_id, subject, duration, approved, approved_at) VALUES (?, ?, ?, 0, NULL) ON CONFLICT(school_id, subject) DO UPDATE SET duration = excluded.duration, approved = 0, approved_at = NULL', [request.user.schoolId, name, minutes])
  response.status(201).json({ subject: name, duration: minutes, approved: 0 })
})

app.post('/api/subjects/:subject/approve', authenticate, requireRole('Admin'), (request, response) => {
  const subject = decodeURIComponent(request.params.subject)
  const existing = rows('SELECT subject FROM subject_settings WHERE school_id = ? AND subject = ?', [request.user.schoolId, subject]).at(0)
  if (!existing) return response.status(404).json({ error: 'Subject settings not found.' })
  run('UPDATE subject_settings SET approved = 1, approved_at = ? WHERE school_id = ? AND subject = ?', [new Date().toISOString(), request.user.schoolId, subject])
  response.json({ subject, approved: 1 })
})

app.delete('/api/subjects/:subject', authenticate, requireRole('Admin'), (request, response) => {
  const subject = decodeURIComponent(request.params.subject)
  if (!rows('SELECT subject FROM subject_settings WHERE school_id = ? AND subject = ?', [request.user.schoolId, subject]).length) return response.status(404).json({ error: 'Subject question set not found.' })
  run('DELETE FROM questions WHERE school_id = ? AND subject = ?', [request.user.schoolId, subject])
  run('DELETE FROM subject_settings WHERE school_id = ? AND subject = ?', [request.user.schoolId, subject])
  response.sendStatus(204)
})

app.post('/api/questions', authenticate, requireRole('Teacher'), (request, response) => {
  const { subject, text, options, answer, examId = null } = request.body || {}
  if (!subject || !text || !Array.isArray(options) || options.length !== 4) return response.status(400).json({ error: 'Subject, question text, and four options are required.' })
  const id = crypto.randomUUID()
  run('INSERT INTO questions (id, school_id, exam_id, subject, text, options, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, request.user.schoolId, examId, String(subject).trim(), text, JSON.stringify(options), Number(answer), Date.now()])
  response.status(201).json({ question: publicQuestion(rows('SELECT * FROM questions WHERE id = ?', [id])[0], true) })
})

app.post('/api/submissions', authenticate, requireRole('Student'), (request, response) => {
  const { examId, answers = {} } = request.body || {}
  const schoolId = request.user.schoolId
  const exam = rows('SELECT exams.* FROM exams JOIN subject_settings ON subject_settings.subject = exams.subject AND subject_settings.school_id = exams.school_id AND subject_settings.approved = 1 WHERE exams.id = ? AND exams.school_id = ? AND exams.status = \'Scheduled\'', [examId, schoolId]).at(0)
  if (!exam) return response.status(404).json({ error: 'Exam is not available.' })
  if (rows('SELECT id FROM submissions WHERE exam_id = ? AND student_id = ?', [examId, request.user.id]).length) return response.status(409).json({ error: 'You have already submitted this exam.' })
  const examQuestions = rows('SELECT questions.id, questions.answer FROM questions JOIN subject_settings ON subject_settings.subject = questions.subject AND subject_settings.school_id = questions.school_id AND subject_settings.approved = 1 WHERE questions.school_id = ? AND (questions.exam_id = ? OR (questions.exam_id IS NULL AND questions.subject = ?))', [schoolId, examId, exam.subject])
  const total = examQuestions.length
  const score = examQuestions.reduce((sum, question) => sum + (Number(answers[question.id]) === Number(question.answer) ? 1 : 0), 0)
  run('INSERT INTO submissions (id, school_id, exam_id, student_id, score, total, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), schoolId, examId, request.user.id, score, total, new Date().toISOString()])
  response.status(201).json({ score, total })
})

/* ---------- front-end files ---------- */

app.use('/api', (_request, response) => response.status(404).json({ error: 'Not found.' }))

if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR, { setHeaders: (response) => response.setHeader('Cache-Control', 'no-store') }))
  app.use((request, response, next) => {
    if (request.method === 'GET') return response.sendFile(path.join(CLIENT_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-store' } })
    next()
  })
}

/* ---------- start ---------- */

async function start() {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) })
  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = fs.existsSync(DB_FILE) ? new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE))) : new SQL.Database()
  db.run('CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL, username TEXT, password_hash TEXT, student_id TEXT, class_section TEXT, deleted INTEGER DEFAULT 0)')
  db.run('CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, questions INTEGER NOT NULL, status TEXT NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, exam_id TEXT, subject TEXT NOT NULL, text TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL, created_at INTEGER NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, exam_id TEXT NOT NULL, student_id TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, submitted_at TEXT NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS subject_settings (school_id TEXT NOT NULL, subject TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 30, approved INTEGER NOT NULL DEFAULT 0, approved_at TEXT, PRIMARY KEY (school_id, subject))')
  db.run('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)')
  db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()])
  persist()
  app.listen(PORT, '0.0.0.0', () => console.log(`TIMPRIEST EDU server running on port ${PORT}, database at ${DB_FILE}`))
}

start().catch((error) => { console.error(error); process.exit(1) })
