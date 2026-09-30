const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const initSqlJs = require('sql.js')

const PORT = Number(process.env.PORT || 8787)
const DATA_DIR = process.env.CBT_DATA_DIR || path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'timpriest-schools.sqlite')
const CLIENT_DIR = path.join(__dirname, '..', 'dist')
const RESERVED_SLUGS = ['api', 'assets', 'register', 'login', 'admin', 'www']
const app = express()
const sessions = new Map()
let db

app.use(express.json({ limit: '1mb' }))
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
}

function verifyPassword(password, stored) {
  const [salt, digest] = String(stored || '').split(':')
  if (!salt || !digest) return false
  const expected = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(digest, 'hex'))
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
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()))
}

function makeSlug(name) {
  let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'school'
  if (RESERVED_SLUGS.includes(base)) base = `${base}-school`
  let slug = base
  let count = 2
  while (rows('SELECT id FROM schools WHERE slug = ?', [slug]).length) { slug = `${base}-${count}`; count += 1 }
  return slug
}

function publicUser(user) {
  return { id: user.id, role: user.role, name: user.name, username: user.username || undefined, studentId: user.student_id || undefined, classSection: user.class_section || undefined }
}

function publicQuestion(question, includeAnswer = false) {
  const result = { id: question.id, examId: question.exam_id, subject: question.subject, text: question.text, options: JSON.parse(question.options) }
  if (includeAnswer) result.answer = Number(question.answer)
  return result
}

function authenticate(request, response, next) {
  const token = String(request.headers.authorization || '').replace('Bearer ', '')
  const user = sessions.get(token)
  if (!user) return response.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  request.user = user
  next()
}

function requireRole(...roles) {
  return (request, response, next) => roles.includes(request.user.role) ? next() : response.status(403).json({ error: 'You do not have permission for this action.' })
}

app.get('/api/health', (_request, response) => response.json({ ok: true, database: 'SQLite', name: 'TIMPRIEST EDU' }))

app.get('/api/school/:slug', (request, response) => {
  const school = rows('SELECT name, slug FROM schools WHERE slug = ?', [String(request.params.slug).toLowerCase()]).at(0)
  if (!school) return response.status(404).json({ error: 'School not found.' })
  response.json(school)
})

app.post('/api/register-admin', (request, response) => {
  const { name, username, password, schoolName } = request.body || {}
  if (!String(schoolName || '').trim()) return response.status(400).json({ error: 'School name is required.' })
  if (!name || !username || !password || String(password).length < 6) return response.status(400).json({ error: 'Name, username, and a password of at least 6 characters are required.' })
  const schoolId = crypto.randomUUID()
  const slug = makeSlug(schoolName)
  run('INSERT INTO schools (id, name, slug) VALUES (?, ?, ?)', [schoolId, String(schoolName).trim(), slug])
  run("INSERT INTO users (id, school_id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, 'Admin', ?, ?, ?, NULL, NULL, 0)", [crypto.randomUUID(), schoolId, String(name).trim(), String(username).trim(), hashPassword(String(password))])
  response.status(201).json({ message: 'School registered.', slug, schoolName: String(schoolName).trim() })
})

app.post('/api/login', (request, response) => {
  const { role, identifier, password = '', schoolSlug = '' } = request.body || {}
  const school = rows('SELECT id FROM schools WHERE slug = ?', [String(schoolSlug).trim().toLowerCase()]).at(0)
  if (!school) return response.status(404).json({ error: 'School not found. Please check your school link.' })
  const column = role === 'Student' ? 'student_id' : 'username'
  const user = rows(`SELECT * FROM users WHERE school_id = ? AND role = ? AND lower(${column}) = lower(?) AND deleted = 0`, [school.id, role, identifier]).at(0)
  const valid = user && (role === 'Student' ? true : verifyPassword(password, user.password_hash))
  if (!valid) return response.status(401).json({ error: role === 'Student' ? 'Student ID not found.' : 'Username or password is incorrect.' })
  const token = crypto.randomBytes(32).toString('hex')
  const sessionUser = { ...publicUser(user), schoolId: user.school_id }
  sessions.set(token, sessionUser)
  response.json({ token, user: sessionUser })
})

app.get('/api/data', authenticate, (request, response) => {
  const schoolId = request.user.schoolId
  const includeAnswers = request.user.role !== 'Student'
  const school = rows('SELECT name, slug FROM schools WHERE id = ?', [schoolId]).at(0) || { name: 'Your School', slug: '' }
  const users = request.user.role === 'Admin' ? rows("SELECT * FROM users WHERE school_id = ? AND deleted = 0 AND role != 'Admin' ORDER BY name", [schoolId]).map(publicUser) : []
  const subjects = rows('SELECT subject, duration, approved, approved_at FROM subject_settings WHERE school_id = ? ORDER BY subject', [schoolId])
  const exams = rows('SELECT exams.id, exams.title, exams.subject, exams.date, exams.time, exams.duration, exams.questions, exams.status, COALESCE(subject_settings.duration, 30) AS subject_duration, COALESCE(subject_settings.approved, 0) AS subject_approved FROM exams LEFT JOIN subject_settings ON subject_settings.subject = exams.subject AND subject_settings.school_id = exams.school_id WHERE exams.school_id = ? ORDER BY exams.date, exams.time', [schoolId])
  const questionSql = request.user.role === 'Student'
    ? 'SELECT questions.id, questions.exam_id, questions.subject, questions.text, questions.options, questions.answer FROM questions JOIN subject_settings ON subject_settings.subject = questions.subject AND subject_settings.school_id = questions.school_id AND subject_settings.approved = 1 WHERE questions.school_id = ? ORDER BY questions.created_at'
    : 'SELECT id, exam_id, subject, text, options, answer FROM questions WHERE school_id = ? ORDER BY created_at'
  const questions = rows(questionSql, [schoolId]).map((question) => publicQuestion(question, includeAnswers))
  const results = request.user.role === 'Admin' ? rows('SELECT submissions.id, submissions.score, submissions.total, submissions.submitted_at, exams.title AS exam_title, users.name AS student_name, users.student_id FROM submissions JOIN exams ON exams.id = submissions.exam_id JOIN users ON users.id = submissions.student_id WHERE submissions.school_id = ? ORDER BY submissions.submitted_at DESC', [schoolId]) : []
  response.json({ users, exams, questions, results, subjects, schoolName: school.name, schoolSlug: school.slug })
})

app.post('/api/users', authenticate, requireRole('Admin'), (request, response) => {
  const schoolId = request.user.schoolId
  const { role, name, username = '', password = '', studentId = '', classSection = '' } = request.body || {}
  if (!['Teacher', 'Student'].includes(role) || !name) return response.status(400).json({ error: 'Name and a valid role are required.' })
  if (role === 'Teacher' && (!username || !password)) return response.status(400).json({ error: 'Teacher username and password are required.' })
  if (role === 'Student' && (!studentId || !classSection)) return response.status(400).json({ error: 'Student ID and class section are required.' })
  const duplicate = role === 'Student'
    ? rows('SELECT id FROM users WHERE school_id = ? AND student_id = ? AND deleted = 0', [schoolId, studentId.toUpperCase()])
    : rows('SELECT id FROM users WHERE school_id = ? AND lower(username) = lower(?) AND deleted = 0', [schoolId, username])
  if (duplicate.length) return response.status(409).json({ error: 'That login already exists.' })
  const id = crypto.randomUUID()
  run('INSERT INTO users (id, school_id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)', [id, schoolId, role, name, role === 'Teacher' ? username : null, role === 'Teacher' ? hashPassword(password) : null, role === 'Student' ? studentId.toUpperCase() : null, role === 'Student' ? classSection.trim() : null])
  response.status(201).json({ user: publicUser(rows('SELECT * FROM users WHERE id = ?', [id])[0]) })
})

app.delete('/api/users/:id', authenticate, requireRole('Admin'), (request, response) => {
  const target = rows("SELECT * FROM users WHERE id = ? AND school_id = ? AND role != 'Admin' AND deleted = 0", [request.params.id, request.user.schoolId]).at(0)
  if (!target) return response.status(404).json({ error: 'User not found.' })
  run('UPDATE users SET deleted = 1 WHERE id = ?', [request.params.id])
  response.sendStatus(204)
})

app.post('/api/exams', authenticate, requireRole('Admin'), (request, response) => {
  const { title, subject, date, time, duration, questions } = request.body || {}
  if (!title || !subject || !date || !time) return response.status(400).json({ error: 'Title, subject, date, and time are required.' })
  const id = crypto.randomUUID()
  run("INSERT INTO exams (id, school_id, title, subject, date, time, duration, questions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled')", [id, request.user.schoolId, title, subject, date, time, Number(duration) || 90, Number(questions) || 0])
  response.status(201).json({ exam: rows('SELECT * FROM exams WHERE id = ?', [id])[0] })
})

app.delete('/api/exams/:id', authenticate, requireRole('Admin'), (request, response) => {
  const schoolId = request.user.schoolId
  const exam = rows("SELECT id FROM exams WHERE id = ? AND school_id = ? AND status IN ('Draft', 'Scheduled', 'Published')", [request.params.id, schoolId]).at(0)
  if (!exam) return response.status(404).json({ error: 'Exam not found or cannot be deleted.' })
  run('DELETE FROM submissions WHERE exam_id = ?', [request.params.id])
  run('DELETE FROM questions WHERE exam_id = ?', [request.params.id])
  run('DELETE FROM exams WHERE id = ?', [request.params.id])
  response.sendStatus(204)
})

app.post('/api/subjects', authenticate, requireRole('Teacher'), (request, response) => {
  const { subject, duration } = request.body || {}
  const minutes = Number(duration)
  if (!subject || !Number.isInteger(minutes) || minutes < 1 || minutes > 30) return response.status(400).json({ error: 'Subject time must be between 1 and 30 minutes.' })
  run('INSERT INTO subject_settings (school_id, subject, duration, approved, approved_at) VALUES (?, ?, ?, 0, NULL) ON CONFLICT(school_id, subject) DO UPDATE SET duration = excluded.duration, approved = 0, approved_at = NULL', [request.user.schoolId, subject.trim(), minutes])
  response.status(201).json({ subject: subject.trim(), duration: minutes, approved: 0 })
})

app.post('/api/subjects/:subject/approve', authenticate, requireRole('Admin'), (request, response) => {
  const subject = decodeURIComponent(request.params.subject)
  const schoolId = request.user.schoolId
  if (!rows('SELECT subject FROM subject_settings WHERE school_id = ? AND subject = ?', [schoolId, subject]).length) return response.status(404).json({ error: 'Subject settings not found.' })
  run('UPDATE subject_settings SET approved = 1, approved_at = ? WHERE school_id = ? AND subject = ?', [new Date().toISOString(), schoolId, subject])
  response.json({ subject, approved: 1 })
})

app.delete('/api/subjects/:subject', authenticate, requireRole('Admin'), (request, response) => {
  const subject = decodeURIComponent(request.params.subject)
  const schoolId = request.user.schoolId
  if (!rows('SELECT subject FROM subject_settings WHERE school_id = ? AND subject = ?', [schoolId, subject]).length) return response.status(404).json({ error: 'Subject question set not found.' })
  run('DELETE FROM questions WHERE school_id = ? AND subject = ?', [schoolId, subject])
  run('DELETE FROM subject_settings WHERE school_id = ? AND subject = ?', [schoolId, subject])
  response.sendStatus(204)
})

app.post('/api/questions', authenticate, requireRole('Teacher'), (request, response) => {
  const schoolId = request.user.schoolId
  const { subject, text, options, answer, examId = null } = request.body || {}
  if (!subject || !text || !Array.isArray(options) || options.length !== 4) return response.status(400).json({ error: 'Subject, question text, and four options are required.' })
  if (examId && !rows('SELECT id FROM exams WHERE id = ? AND school_id = ?', [examId, schoolId]).length) return response.status(400).json({ error: 'That exam does not belong to your school.' })
  const id = crypto.randomUUID()
  run('INSERT INTO questions (id, school_id, exam_id, subject, text, options, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, schoolId, examId, subject, text, JSON.stringify(options), Number(answer), Date.now()])
  response.status(201).json({ question: publicQuestion(rows('SELECT * FROM questions WHERE id = ?', [id])[0], true) })
})

app.post('/api/submissions', authenticate, requireRole('Student'), (request, response) => {
  const schoolId = request.user.schoolId
  const { examId, answers = {} } = request.body || {}
  const exam = rows("SELECT exams.* FROM exams JOIN subject_settings ON subject_settings.subject = exams.subject AND subject_settings.school_id = exams.school_id AND subject_settings.approved = 1 WHERE exams.id = ? AND exams.school_id = ? AND exams.status = 'Scheduled'", [examId, schoolId]).at(0)
  if (!exam) return response.status(404).json({ error: 'Exam is not available.' })
  const examQuestions = rows('SELECT questions.id, questions.answer FROM questions JOIN subject_settings ON subject_settings.subject = questions.subject AND subject_settings.school_id = questions.school_id AND subject_settings.approved = 1 WHERE questions.school_id = ? AND (questions.exam_id = ? OR (questions.exam_id IS NULL AND questions.subject = ?))', [schoolId, examId, exam.subject])
  const total = examQuestions.length
  const score = examQuestions.reduce((sum, question) => sum + (Number(answers[question.id]) === Number(question.answer) ? 1 : 0), 0)
  const id = crypto.randomUUID()
  run('INSERT INTO submissions (id, school_id, exam_id, student_id, score, total, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, schoolId, examId, request.user.id, score, total, new Date().toISOString()])
  response.status(201).json({ score, total })
})

if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR, { setHeaders: (response) => response.setHeader('Cache-Control', 'no-store') }))
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) return response.sendFile(path.join(CLIENT_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-store' } })
    next()
  })
}

async function start() {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) })
  db = fs.existsSync(DB_FILE) ? new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE))) : new SQL.Database()
  db.run('CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE)')
  db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, role TEXT NOT NULL, name TEXT NOT NULL, username TEXT, password_hash TEXT, student_id TEXT, class_section TEXT, deleted INTEGER DEFAULT 0)')
  db.run('CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, questions INTEGER NOT NULL, status TEXT NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, exam_id TEXT, subject TEXT NOT NULL, text TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL, created_at INTEGER NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, exam_id TEXT NOT NULL, student_id TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, submitted_at TEXT NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS subject_settings (school_id TEXT NOT NULL, subject TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 30, approved INTEGER NOT NULL DEFAULT 0, approved_at TEXT, PRIMARY KEY (school_id, subject))')
  persist()
  app.listen(PORT, '0.0.0.0', () => console.log(`TIMPRIEST EDU backend running on http://0.0.0.0:${PORT}`))
}

start().catch((error) => { console.error(error); process.exit(1) })