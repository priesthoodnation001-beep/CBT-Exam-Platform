// Two-way sync between the online server and a school's offline server.
//
// Rules (kept simple on purpose):
//  - Every row that can change carries an updated_at time. The newest edit wins ("last write wins").
//  - Deleted exams and subjects leave a small "tombstone" so the deletion reaches the other side.
//  - Exam results (submissions) are only ever added, never edited.
//  - Accounts (admin, teachers, students) sync, so one registration works on both sides. Credits are NOT synced: each side keeps its own balance.
//  - Clock differences between the two computers are corrected using the skew passed to applyChanges.

const SYNCED_ROLES = "('Admin', 'Teacher', 'Student')"
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
const MAX_ROWS = 50000

module.exports = function createSync({ rows, exec, persist }) {
  const text = (value, max = 5000) => String(value ?? '').slice(0, max)
  const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
  const list = (value) => (Array.isArray(value) ? value.slice(0, MAX_ROWS) : [])

  // Adds updated_at columns, the tombstone table and the triggers that keep updated_at fresh.
  function migrate() {
    for (const table of ['users', 'exams', 'questions', 'subject_settings']) {
      try { exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT`) } catch { /* column already exists */ }
      exec(`UPDATE ${table} SET updated_at = ? WHERE updated_at IS NULL`, [new Date().toISOString()])
    }
    exec('CREATE TABLE IF NOT EXISTS tombstones (school_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY (school_id, kind, key))')
    const where = { users: 'id = NEW.id', exams: 'id = NEW.id', questions: 'id = NEW.id', subject_settings: 'school_id = NEW.school_id AND subject = NEW.subject' }
    for (const [table, match] of Object.entries(where)) {
      exec(`CREATE TRIGGER IF NOT EXISTS ${table}_touch_insert AFTER INSERT ON ${table} WHEN NEW.updated_at IS NULL BEGIN UPDATE ${table} SET updated_at = ${NOW_SQL} WHERE ${match}; END`)
      exec(`CREATE TRIGGER IF NOT EXISTS ${table}_touch_update AFTER UPDATE ON ${table} WHEN NEW.updated_at IS OLD.updated_at BEGIN UPDATE ${table} SET updated_at = ${NOW_SQL} WHERE ${match}; END`)
    }
    persist()
  }

  function recordTombstone(schoolId, kind, key) {
    exec('INSERT INTO tombstones (school_id, kind, key, deleted_at) VALUES (?, ?, ?, ?) ON CONFLICT(school_id, kind, key) DO UPDATE SET deleted_at = excluded.deleted_at', [schoolId, kind, String(key), new Date().toISOString()])
    persist()
  }

  // Everything in this school that changed at or after `since` (an ISO time, or empty for everything).
  // "at or after" (not strictly after) so a change made in the same millisecond as the last sync is never missed.
  function collectChanges(schoolId, since) {
    const after = since || ''
    return {
      users: rows(`SELECT id, role, name, username, password_hash AS passwordHash, student_id AS studentId, class_section AS classSection, deleted, updated_at AS updatedAt FROM users WHERE school_id = ? AND role IN ${SYNCED_ROLES} AND updated_at >= ?`, [schoolId, after]),
      exams: rows('SELECT id, title, subject, date, time, duration, questions, status, updated_at AS updatedAt FROM exams WHERE school_id = ? AND updated_at >= ?', [schoolId, after]),
      subjects: rows('SELECT subject, duration, approved, approved_at AS approvedAt, updated_at AS updatedAt FROM subject_settings WHERE school_id = ? AND updated_at >= ?', [schoolId, after]),
      questions: rows('SELECT id, exam_id AS examId, subject, text, options, answer, created_at AS createdAt, updated_at AS updatedAt FROM questions WHERE school_id = ? AND updated_at >= ?', [schoolId, after]),
      submissions: rows('SELECT id, exam_id AS examId, student_id AS studentId, score, total, submitted_at AS submittedAt FROM submissions WHERE school_id = ? AND submitted_at >= ?', [schoolId, after]),
      tombstones: rows('SELECT kind, key, deleted_at AS deletedAt FROM tombstones WHERE school_id = ? AND deleted_at >= ?', [schoolId, after])
    }
  }

  function count(changes) {
    return ['users', 'exams', 'subjects', 'questions', 'submissions', 'tombstones'].reduce((sum, name) => sum + (changes[name]?.length || 0), 0)
  }

  // Merge changes from the other side into this school. skewMs is added to the other side's times.
  function applyChanges(schoolId, incoming, skewMs = 0) {
    const stats = { applied: 0, skipped: 0, conflicts: 0 }
    const ceiling = Date.now() // a change can never be dated in the future, so a wrong clock cannot win forever
    const shift = (value) => {
      const parsed = Date.parse(String(value || ''))
      return Number.isNaN(parsed) ? null : new Date(Math.min(parsed + skewMs, ceiling)).toISOString()
    }
    const tombstoneAfter = (kind, key, updatedAt) => {
      const row = rows('SELECT deleted_at FROM tombstones WHERE school_id = ? AND kind = ? AND key = ?', [schoolId, kind, String(key)]).at(0)
      return Boolean(row && row.deleted_at >= updatedAt)
    }

    exec('BEGIN')
    try {
      // 1. deletions first, so deleted things are not brought back by older copies in the same batch
      for (const tomb of list(incoming?.tombstones)) {
        const deletedAt = shift(tomb.deletedAt)
        const kind = text(tomb.kind, 20)
        const key = text(tomb.key, 300)
        if (!deletedAt || !['exam', 'subject'].includes(kind) || !key) { stats.skipped += 1; continue }
        const known = rows('SELECT deleted_at FROM tombstones WHERE school_id = ? AND kind = ? AND key = ?', [schoolId, kind, key]).at(0)
        if (!known || known.deleted_at < deletedAt) exec('INSERT INTO tombstones (school_id, kind, key, deleted_at) VALUES (?, ?, ?, ?) ON CONFLICT(school_id, kind, key) DO UPDATE SET deleted_at = excluded.deleted_at', [schoolId, kind, key, deletedAt])
        if (kind === 'exam') {
          const exam = rows('SELECT id FROM exams WHERE id = ? AND school_id = ? AND updated_at <= ?', [key, schoolId, deletedAt]).at(0)
          if (exam) {
            exec('DELETE FROM submissions WHERE exam_id = ? AND school_id = ?', [key, schoolId])
            exec('DELETE FROM questions WHERE exam_id = ? AND school_id = ?', [key, schoolId])
            exec('DELETE FROM exams WHERE id = ? AND school_id = ?', [key, schoolId])
          }
        } else {
          exec('DELETE FROM questions WHERE school_id = ? AND subject = ? AND updated_at <= ?', [schoolId, key, deletedAt])
          exec('DELETE FROM subject_settings WHERE school_id = ? AND subject = ? AND updated_at <= ?', [schoolId, key, deletedAt])
        }
        stats.applied += 1
      }

      // 2. accounts (admin, teachers and students)
      for (const user of list(incoming?.users)) {
        const updatedAt = shift(user.updatedAt)
        const role = text(user.role, 20)
        if (!updatedAt || !['Admin', 'Teacher', 'Student'].includes(role) || !text(user.id, 100) || !text(user.name, 200)) { stats.skipped += 1; continue }
        const existing = rows('SELECT updated_at FROM users WHERE id = ? AND school_id = ?', [user.id, schoolId]).at(0)
        const deleted = number(user.deleted) ? 1 : 0
        const username = role !== 'Student' ? text(user.username, 100) : null
        const studentId = role === 'Student' ? text(user.studentId, 100).toUpperCase() : null
        if (existing) {
          if (updatedAt > existing.updated_at) {
            exec('UPDATE users SET name = ?, username = ?, password_hash = ?, student_id = ?, class_section = ?, deleted = ?, updated_at = ? WHERE id = ? AND school_id = ?', [text(user.name, 200), username, role !== 'Student' ? text(user.passwordHash, 500) : null, studentId, role === 'Student' ? text(user.classSection, 100) : null, deleted, updatedAt, user.id, schoolId])
            stats.applied += 1
          } else stats.skipped += 1
          continue
        }
        if (!deleted) {
          const clash = role !== 'Student'
            ? rows('SELECT id FROM users WHERE school_id = ? AND lower(username) = lower(?) AND deleted = 0', [schoolId, username]).length
            : rows('SELECT id FROM users WHERE school_id = ? AND student_id = ? AND deleted = 0', [schoolId, studentId]).length
          if (clash) { stats.conflicts += 1; continue }
        }
        exec("INSERT INTO users (id, school_id, role, name, username, password_hash, student_id, class_section, deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [user.id, schoolId, role, text(user.name, 200), username, role !== 'Student' ? text(user.passwordHash, 500) : null, studentId, role === 'Student' ? text(user.classSection, 100) : null, deleted, updatedAt])
        stats.applied += 1
      }

      // 3. exams
      for (const exam of list(incoming?.exams)) {
        const updatedAt = shift(exam.updatedAt)
        if (!updatedAt || !text(exam.id, 100) || !text(exam.title, 300)) { stats.skipped += 1; continue }
        const existing = rows('SELECT updated_at FROM exams WHERE id = ? AND school_id = ?', [exam.id, schoolId]).at(0)
        if (existing) {
          if (updatedAt > existing.updated_at) {
            exec('UPDATE exams SET title = ?, subject = ?, date = ?, time = ?, duration = ?, questions = ?, status = ?, updated_at = ? WHERE id = ? AND school_id = ?', [text(exam.title, 300), text(exam.subject, 100), text(exam.date, 50), text(exam.time, 50), number(exam.duration, 90), number(exam.questions), text(exam.status, 30), updatedAt, exam.id, schoolId])
            stats.applied += 1
          } else stats.skipped += 1
          continue
        }
        if (tombstoneAfter('exam', exam.id, updatedAt)) { stats.skipped += 1; continue }
        exec('INSERT INTO exams (id, school_id, title, subject, date, time, duration, questions, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [exam.id, schoolId, text(exam.title, 300), text(exam.subject, 100), text(exam.date, 50), text(exam.time, 50), number(exam.duration, 90), number(exam.questions), text(exam.status, 30), updatedAt])
        stats.applied += 1
      }

      // 4. subject settings (duration and approval)
      for (const subject of list(incoming?.subjects)) {
        const updatedAt = shift(subject.updatedAt)
        const name = text(subject.subject, 100)
        if (!updatedAt || !name) { stats.skipped += 1; continue }
        const existing = rows('SELECT updated_at FROM subject_settings WHERE school_id = ? AND subject = ?', [schoolId, name]).at(0)
        const approvedAt = subject.approvedAt ? shift(subject.approvedAt) : null
        if (existing) {
          if (updatedAt > existing.updated_at) {
            exec('UPDATE subject_settings SET duration = ?, approved = ?, approved_at = ?, updated_at = ? WHERE school_id = ? AND subject = ?', [number(subject.duration, 30), number(subject.approved) ? 1 : 0, approvedAt, updatedAt, schoolId, name])
            stats.applied += 1
          } else stats.skipped += 1
          continue
        }
        if (tombstoneAfter('subject', name, updatedAt)) { stats.skipped += 1; continue }
        exec('INSERT INTO subject_settings (school_id, subject, duration, approved, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [schoolId, name, number(subject.duration, 30), number(subject.approved) ? 1 : 0, approvedAt, updatedAt])
        stats.applied += 1
      }

      // 5. questions
      for (const question of list(incoming?.questions)) {
        const updatedAt = shift(question.updatedAt)
        const options = text(question.options, 5000)
        let validOptions = false
        try { validOptions = Array.isArray(JSON.parse(options)) && JSON.parse(options).length === 4 } catch { /* not valid */ }
        if (!updatedAt || !text(question.id, 100) || !text(question.text, 2000) || !validOptions) { stats.skipped += 1; continue }
        const existing = rows('SELECT updated_at FROM questions WHERE id = ? AND school_id = ?', [question.id, schoolId]).at(0)
        const examId = question.examId ? text(question.examId, 100) : null
        if (existing) {
          if (updatedAt > existing.updated_at) {
            exec('UPDATE questions SET exam_id = ?, subject = ?, text = ?, options = ?, answer = ?, updated_at = ? WHERE id = ? AND school_id = ?', [examId, text(question.subject, 100), text(question.text, 2000), options, number(question.answer), updatedAt, question.id, schoolId])
            stats.applied += 1
          } else stats.skipped += 1
          continue
        }
        if ((examId && tombstoneAfter('exam', examId, updatedAt)) || tombstoneAfter('subject', text(question.subject, 100), updatedAt)) { stats.skipped += 1; continue }
        exec('INSERT INTO questions (id, school_id, exam_id, subject, text, options, answer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [question.id, schoolId, examId, text(question.subject, 100), text(question.text, 2000), options, number(question.answer), number(question.createdAt, Date.now()), updatedAt])
        stats.applied += 1
      }

      // 6. results are only added, never changed
      for (const result of list(incoming?.submissions)) {
        const submittedAt = shift(result.submittedAt)
        if (!submittedAt || !text(result.id, 100)) { stats.skipped += 1; continue }
        if (rows('SELECT id FROM submissions WHERE id = ?', [result.id]).length) { stats.skipped += 1; continue }
        const hasExam = rows('SELECT id FROM exams WHERE id = ? AND school_id = ?', [result.examId, schoolId]).length
        const hasStudent = rows('SELECT id FROM users WHERE id = ? AND school_id = ?', [result.studentId, schoolId]).length
        const already = rows('SELECT id FROM submissions WHERE exam_id = ? AND student_id = ?', [result.examId, result.studentId]).length
        if (!hasExam || !hasStudent || already) { if (already) stats.conflicts += 1; else stats.skipped += 1; continue }
        exec('INSERT INTO submissions (id, school_id, exam_id, student_id, score, total, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [result.id, schoolId, result.examId, result.studentId, number(result.score), number(result.total), submittedAt])
        stats.applied += 1
      }
      exec('COMMIT')
    } catch (error) {
      try { exec('ROLLBACK') } catch { /* nothing to roll back */ }
      throw error
    }
    persist()
    return stats
  }

  return { migrate, recordTombstone, collectChanges, applyChanges, count }
}
