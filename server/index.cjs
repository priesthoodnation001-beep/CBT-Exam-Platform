const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const initSqlJs = require('sql.js')

const PORT = Number(process.env.PORT || 8787)
const DATA_DIR = process.env.CBT_DATA_DIR || path.join(__dirname, '..', 'data')
const DB_FILE = path.join(DATA_DIR, 'timpriest.sqlite')
const CLIENT_DIR = path.join(__dirname, '..', 'dist')
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

app.post('/api/register-admin', (request, response) => {
  const { name, username, password, schoolName } = request.body || {}
  if (rows("SELECT id FROM users WHERE role = 'Admin' AND deleted = 0").length) return response.status(403).json({ error: 'This school already has an Admin. Please sign in instead.' })
  if (!String(schoolName || '').trim()) return response.status(400).json({ error: 'School name is required.' })
  if (!name || !username || !password || String(password).length < 6) return response.status(400).json({ error: 'Name, username, and a password of at least 6 characters are required.' })
  if (rows('SELECT id FROM users WHERE lower(username) = lower(?) AND deleted = 0', [String(username).trim()]).length) return response.status(409).json({ error: 'That Admin username is already in use.' })
  const id = crypto.randomUUID()
  run('INSERT INTO users (id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, \'Admin\', ?, ?, ?, NULL, NULL, 0)', [id, String(name).trim(), String(username).trim(), hashPassword(String(password))])
  run("INSERT INTO settings (key, value) VALUES ('school_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(schoolName).trim()])
  response.status(201).json({ message: 'Admin account created.' })
  db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
})

app.post('/api/login', (request, response) => {
  const { role, identifier, password = '' } = request.body || {}
  const column = role === 'Student' ? 'student_id' : 'username'
  const user = rows(`SELECT * FROM users WHERE role = ? AND lower(${column}) = lower(?) AND deleted = 0`, [role, identifier]).at(0)
  const valid = user && (role === 'Student' ? true : verifyPassword(password, user.password_hash))
  if (!valid) return response.status(401).json({ error: role === 'Student' ? 'Student ID not found.' : 'Username or password is incorrect.' })
  const token = crypto.randomBytes(32).toString('hex')
  const sessionUser = publicUser(user)
  sessions.set(token, sessionUser)
  response.json({ token, user: sessionUser })
})

app.get('/api/data', authenticate, (request, response) => {
  const includeAnswers = request.user.role !== 'Student'
  const users = request.user.role === 'Admin' ? rows('SELECT * FROM users WHERE deleted = 0 AND role != \'Admin\' ORDER BY name').map(publicUser) : []
  const subjects = rows('SELECT subject, duration, approved, approved_at FROM subject_settings ORDER BY subject')
  const exams = rows('SELECT exams.id, exams.title, exams.subject, exams.date, exams.time, exams.duration, exams.questions, exams.status, COALESCE(subject_settings.duration, 30) AS subject_duration, COALESCE(subject_settings.approved, 0) AS subject_approved FROM exams LEFT JOIN subject_settings ON subject_settings.subject = exams.subject ORDER BY exams.date, exams.time')
  const questionSql = request.user.role === 'Student' ? 'SELECT questions.id, questions.exam_id, questions.subject, questions.text, questions.options, questions.answer FROM questions JOIN subject_settings ON subject_settings.subject = questions.subject AND subject_settings.approved = 1 ORDER BY questions.created_at' : 'SELECT id, exam_id, subject, text, options, answer FROM questions ORDER BY created_at'
  const questions = rows(questionSql).map((question) => publicQuestion(question, includeAnswers))
  const results = request.user.role === 'Admin' ? rows(`SELECT submissions.id, submissions.score, submissions.total, submissions.submitted_at, exams.title AS exam_title, users.name AS student_name, users.student_id FROM submissions JOIN exams ON exams.id = submissions.exam_id JOIN users ON users.id = submissions.student_id ORDER BY submissions.submitted_at DESC`) : []
  response.json({ users, exams, questions, results, subjects, schoolName: rows("SELECT value FROM settings WHERE key = 'school_name'").at(0)?.value || 'Your School' })
})

app.post('/api/users', authenticate, requireRole('Admin'), (request, response) => {
  const { role, name, username = '', password = '', studentId = '', classSection = '' } = request.body || {}
  if (!['Teacher', 'Student'].includes(role) || !name) return response.status(400).json({ error: 'Name and a valid role are required.' })
  if (role === 'Teacher' && (!username || !password)) return response.status(400).json({ error: 'Teacher username and password are required.' })
  if (role === 'Student' && (!studentId || !classSection)) return response.status(400).json({ error: 'Student ID and class section are required.' })
  const duplicate = role === 'Student' ? rows('SELECT id FROM users WHERE student_id = ? AND deleted = 0', [studentId]) : rows('SELECT id FROM users WHERE username = ? AND deleted = 0', [username])
  if (duplicate.length) return response.status(409).json({ error: 'That login already exists.' })
  const id = crypto.randomUUID()
  run('INSERT INTO users (id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)', [id, role, name, role === 'Teacher' ? username : null, role === 'Teacher' ? hashPassword(password) : null, role === 'Student' ? studentId.toUpperCase() : null, role === 'Student' ? classSection.trim() : null])
  response.status(201).json({ user: publicUser(rows('SELECT * FROM users WHERE id = ?', [id])[0]) })
})

app.delete('/api/users/:id', authenticate, requireRole('Admin'), (request, response) => {
  const target = rows('SELECT * FROM users WHERE id = ? AND role != \'Admin\' AND deleted = 0', [request.params.id]).at(0)
  if (!target) return response.status(404).json({ error: 'User not found.' })
  run('UPDATE users SET deleted = 1 WHERE id = ?', [request.params.id])
  response.sendStatus(204)
})

app.post('/api/exams', authenticate, requireRole('Admin'), (request, response) => {
  const { title, subject, date, time, duration, questions } = request.body || {}
  if (!title || !subject || !date || !time) return response.status(400).json({ error: 'Title, subject, date, and time are required.' })
  const id = crypto.randomUUID()
  run('INSERT INTO exams (id, title, subject, date, time, duration, questions, status) VALUES (?, ?, ?, ?, ?, ?, ?, \'Scheduled\')', [id, title, subject, date, time, Number(duration) || 90, Number(questions) || 0])
  response.status(201).json({ exam: rows('SELECT * FROM exams WHERE id = ?', [id])[0] })
})

app.delete('/api/exams/:id', authenticate, requireRole('Admin'), (request, response) => {
  const exam = rows('SELECT id, title, status FROM exams WHERE id = ? AND status IN (\'Draft\', \'Scheduled\', \'Published\')', [request.params.id]).at(0)
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
  run('INSERT INTO subject_settings (subject, duration, approved, approved_at) VALUES (?, ?, 0, NULL) ON CONFLICT(subject) DO UPDATE SET duration = excluded.duration, approved = 0, approved_at = NULL', [subject.trim(), minutes])
  response.status(201).json({ subject: subject.trim(), duration: minutes, approved: 0 })
})

app.post('/api/subjects/:subject/approve', authenticate, requireRole('Admin'), (request, response) => {
  const subject = decodeURIComponent(request.params.subject)
  const existing = rows('SELECT subject FROM subject_settings WHERE subject = ?', [subject]).at(0)
  if (!existing) return response.status(404).json({ error: 'Subject settings not found.' })
  run('UPDATE subject_settings SET approved = 1, approved_at = ? WHERE subject = ?', [new Date().toISOString(), subject])
  response.json({ subject, approved: 1 })
})

app.delete('/api/subjects/:subject', authenticate, requireRole('Admin'), (request, response) => {
  const subject = decodeURIComponent(request.params.subject)
  if (!rows('SELECT subject FROM subject_settings WHERE subject = ?', [subject]).length) return response.status(404).json({ error: 'Subject question set not found.' })
  run('DELETE FROM questions WHERE subject = ?', [subject])
  run('DELETE FROM subject_settings WHERE subject = ?', [subject])
  response.sendStatus(204)
})

if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR, { setHeaders: (response) => response.setHeader('Cache-Control', 'no-store') }))
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) return response.sendFile(path.join(CLIENT_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-store' } })
    next()
  })
}

app.post('/api/questions', authenticate, requireRole('Teacher'), (request, response) => {
  const { subject, text, options, answer, examId = null } = request.body || {}
  if (!subject || !text || !Array.isArray(options) || options.length !== 4) return response.status(400).json({ error: 'Subject, question text, and four options are required.' })
  const id = crypto.randomUUID()
  run('INSERT INTO questions (id, exam_id, subject, text, options, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, examId, subject, text, JSON.stringify(options), Number(answer), Date.now()])
  response.status(201).json({ question: publicQuestion(rows('SELECT * FROM questions WHERE id = ?', [id])[0], true) })
})

app.post('/api/submissions', authenticate, requireRole('Student'), (request, response) => {
  const { examId, answers = {} } = request.body || {}
  const exam = rows('SELECT exams.* FROM exams JOIN subject_settings ON subject_settings.subject = exams.subject AND subject_settings.approved = 1 WHERE exams.id = ? AND exams.status = \'Scheduled\'', [examId]).at(0)
  if (!exam) return response.status(404).json({ error: 'Exam is not available.' })
  const examQuestions = rows('SELECT questions.id, questions.answer FROM questions JOIN subject_settings ON subject_settings.subject = questions.subject AND subject_settings.approved = 1 WHERE questions.exam_id = ? OR (questions.exam_id IS NULL AND questions.subject = ?)', [examId, exam.subject])
  const total = examQuestions.length
  const score = examQuestions.reduce((sum, question) => sum + (Number(answers[question.id]) === Number(question.answer) ? 1 : 0), 0)
  const id = crypto.randomUUID()
  run('INSERT INTO submissions (id, exam_id, student_id, score, total, submitted_at) VALUES (?, ?, ?, ?, ?, ?)', [id, examId, request.user.id, score, total, new Date().toISOString()])
  response.status(201).json({ score, total })
})

async function start() {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) })
  db = fs.existsSync(DB_FILE) ? new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE))) : new SQL.Database()
  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, username TEXT UNIQUE, password_hash TEXT, student_id TEXT UNIQUE, class_section TEXT, deleted INTEGER DEFAULT 0)`)
  if (!rows('PRAGMA table_info(users)').some((column) => column.name === 'class_section')) db.run('ALTER TABLE users ADD COLUMN class_section TEXT')
  db.run(`CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, duration INTEGER NOT NULL, questions INTEGER NOT NULL, status TEXT NOT NULL)`)
  db.run(`CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, exam_id TEXT, subject TEXT NOT NULL, text TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL, created_at INTEGER NOT NULL)`)
  db.run(`CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, student_id TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, submitted_at TEXT NOT NULL)`)
  db.run(`CREATE TABLE IF NOT EXISTS subject_settings (subject TEXT PRIMARY KEY, duration INTEGER NOT NULL DEFAULT 30, approved INTEGER NOT NULL DEFAULT 0, approved_at TEXT)`)
  if (!rows('SELECT id FROM users LIMIT 1').length) {
    run('INSERT INTO users (id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)', ['admin-1', 'Admin', 'Amina Malik', 'admin', hashPassword('admin123'), null, null])
    run('INSERT INTO users (id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)', ['teacher-1', 'Teacher', 'Joseph Owusu', 'teacher1', hashPassword('teach123'), null, null])
    run('INSERT INTO users (id, role, name, username, password_hash, student_id, class_section, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)', ['student-1', 'Student', 'David Mensah', null, null, 'STU-001', 'SSS 1'])
  }
  if (!rows('SELECT id FROM exams LIMIT 1').length) {
    run('INSERT INTO exams (id, title, subject, date, time, duration, questions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ['exam-1', 'Mathematics 1', 'Mathematics', '2026-10-10', '09:00', 120, 45, 'Scheduled'])
    run('INSERT INTO exams (id, title, subject, date, time, duration, questions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ['exam-2', 'Biology practical', 'Biology', '2026-10-14', '13:30', 90, 30, 'Draft'])
  }
  if (!rows('SELECT id FROM questions LIMIT 1').length) {
    run('INSERT INTO questions (id, exam_id, subject, text, options, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['q-1', 'exam-1', 'Mathematics', 'What is the value of 12 x 8?', JSON.stringify(['86', '96', '108', '112']), 1, Date.now()])
    run('INSERT INTO questions (id, exam_id, subject, text, options, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['q-2', 'exam-1', 'Mathematics', 'Which number is a prime number?', JSON.stringify(['21', '27', '31', '39']), 2, Date.now()])
  }
  if (!rows('SELECT subject FROM subject_settings WHERE subject = ?', ['Mathematics']).length) run('INSERT INTO subject_settings (subject, duration, approved, approved_at) VALUES (?, ?, 1, ?)', ['Mathematics', 30, new Date().toISOString()])
    run("DELETE FROM users WHERE id IN ('admin-1', 'teacher-1', 'student-1')")
  run("DELETE FROM exams WHERE id IN ('exam-1', 'exam-2')")
  run("DELETE FROM questions WHERE id IN ('q-1', 'q-2')")
  persist()
  app.listen(PORT, '0.0.0.0', () => console.log(`TIMPRIEST EDU LAN backend running on http://0.0.0.0:${PORT}`))
}

start().catch((error) => { console.error(error); process.exit(1) })
