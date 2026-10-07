// Support messages between a school's admin and the creator (the owner of the platform).
// Tickets live on the website only. A school computer forwards its admin's messages to the website.

const crypto = require('crypto')

const CATEGORIES = ['Payment problem', 'Credits not showing', 'Cannot sign in', 'Exam problem', 'Other']
const MAX_NEW_PER_HOUR = 5
const MAX_MESSAGES = 200

module.exports = function createSupport({ rows, run }) {
  const now = () => new Date().toISOString()
  const text = (value, max) => String(value ?? '').trim().slice(0, max)
  const ok = (body) => ({ status: 200, body })
  const fail = (status, error) => ({ status, body: { error } })

  const ticketOfSchool = (schoolId, id) => rows('SELECT * FROM support_tickets WHERE id = ? AND school_id = ?', [id, schoolId]).at(0)
  const messagesOf = (id) => rows('SELECT id, sender, body, created_at AS createdAt FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC', [id])

  function addMessage(ticketId, sender, body) {
    run('INSERT INTO support_messages (id, ticket_id, sender, body, created_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), ticketId, sender, body, now()])
  }

  // ---------- admin side ----------

  function adminList(schoolId) {
    const tickets = rows(`SELECT t.id, t.subject, t.category, t.status, t.updated_at AS updatedAt, t.admin_unread AS unread,
        (SELECT body FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last
      FROM support_tickets t WHERE t.school_id = ? ORDER BY t.updated_at DESC LIMIT 50`, [schoolId])
    return ok({ tickets, unread: tickets.reduce((sum, ticket) => sum + Number(ticket.unread || 0), 0), categories: CATEGORIES })
  }

  function adminCreate(user, input) {
    const subject = text(input?.subject, 120)
    const message = text(input?.message, 2000)
    const category = CATEGORIES.includes(input?.category) ? input.category : 'Other'
    if (subject.length < 3) return fail(400, 'Write a short title, for example "Credits not showing".')
    if (message.length < 5) return fail(400, 'Please describe the problem in a few words.')
    const recent = rows('SELECT COUNT(*) AS n FROM support_tickets WHERE school_id = ? AND created_at > ?', [user.schoolId, new Date(Date.now() - 3600000).toISOString()]).at(0)
    if (Number(recent?.n || 0) >= MAX_NEW_PER_HOUR) return fail(429, 'You have sent several messages in the last hour. Please wait for a reply or try again later.')
    const id = crypto.randomUUID()
    const stamp = now()
    run('INSERT INTO support_tickets (id, school_id, user_id, user_name, subject, category, status, created_at, updated_at, admin_unread, creator_unread) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)', [id, user.schoolId, user.id, text(user.name, 100), subject, category, 'open', stamp, stamp])
    addMessage(id, 'admin', message)
    return { status: 201, body: { id } }
  }

  function adminGet(user, id) {
    const ticket = ticketOfSchool(user.schoolId, id)
    if (!ticket) return fail(404, 'Message not found.')
    if (ticket.admin_unread) run('UPDATE support_tickets SET admin_unread = 0 WHERE id = ?', [id])
    return ok({ ticket: { id: ticket.id, subject: ticket.subject, category: ticket.category, status: ticket.status }, messages: messagesOf(id) })
  }

  function adminReply(user, id, input) {
    const ticket = ticketOfSchool(user.schoolId, id)
    if (!ticket) return fail(404, 'Message not found.')
    const body = text(input?.body, 2000)
    if (body.length < 2) return fail(400, 'Write your message first.')
    if (rows('SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id = ?', [id]).at(0).n >= MAX_MESSAGES) return fail(400, 'This conversation is full. Please start a new message.')
    addMessage(id, 'admin', body)
    run("UPDATE support_tickets SET status = 'open', updated_at = ?, creator_unread = 1 WHERE id = ?", [now(), id])
    return ok({ ok: true })
  }

  function adminResolve(user, id) {
    const ticket = ticketOfSchool(user.schoolId, id)
    if (!ticket) return fail(404, 'Message not found.')
    run("UPDATE support_tickets SET status = 'resolved', updated_at = ? WHERE id = ?", [now(), id])
    return ok({ ok: true })
  }

  // ---------- creator side ----------

  function creatorList() {
    const tickets = rows(`SELECT t.id, t.subject, t.category, t.status, t.updated_at AS updatedAt, t.creator_unread AS unread, t.user_name AS from_name, s.name AS school,
        (SELECT body FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last
      FROM support_tickets t LEFT JOIN schools s ON s.id = t.school_id ORDER BY t.creator_unread DESC, t.updated_at DESC LIMIT 200`)
      .map((ticket) => ({ ...ticket, school: ticket.school || '(deleted school)' }))
    return ok({ tickets, unread: tickets.reduce((sum, ticket) => sum + Number(ticket.unread || 0), 0) })
  }

  function creatorUnread() {
    return Number(rows('SELECT COALESCE(SUM(creator_unread), 0) AS n FROM support_tickets').at(0)?.n || 0)
  }

  function creatorGet(id) {
    const ticket = rows('SELECT t.*, s.name AS school FROM support_tickets t LEFT JOIN schools s ON s.id = t.school_id WHERE t.id = ?', [id]).at(0)
    if (!ticket) return fail(404, 'Message not found.')
    if (ticket.creator_unread) run('UPDATE support_tickets SET creator_unread = 0 WHERE id = ?', [id])
    return ok({ ticket: { id: ticket.id, subject: ticket.subject, category: ticket.category, status: ticket.status, school: ticket.school || '(deleted school)', from: ticket.user_name }, messages: messagesOf(id) })
  }

  function creatorReply(id, input) {
    const ticket = rows('SELECT id FROM support_tickets WHERE id = ?', [id]).at(0)
    if (!ticket) return fail(404, 'Message not found.')
    const body = text(input?.body, 2000)
    if (body.length < 2) return fail(400, 'Write your reply first.')
    addMessage(id, 'creator', body)
    run('UPDATE support_tickets SET status = ?, updated_at = ?, admin_unread = 1, creator_unread = 0 WHERE id = ?', [input?.resolve ? 'resolved' : 'answered', now(), id])
    return ok({ ok: true })
  }

  function creatorStatus(id, status) {
    if (!['open', 'answered', 'resolved'].includes(status)) return fail(400, 'Unknown status.')
    if (!rows('SELECT id FROM support_tickets WHERE id = ?', [id]).length) return fail(404, 'Message not found.')
    run('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id])
    return ok({ ok: true })
  }

  // used when the creator deletes a school
  function deleteForSchool(schoolId) {
    run('DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE school_id = ?)', [schoolId])
    run('DELETE FROM support_tickets WHERE school_id = ?', [schoolId])
  }

  return { adminList, adminCreate, adminGet, adminReply, adminResolve, creatorList, creatorUnread, creatorGet, creatorReply, creatorStatus, deleteForSchool, CATEGORIES }
}
