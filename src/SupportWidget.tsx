import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE } from './apiBase'
import './support.css'

// Floating "Help & support" button for the Admin. Messages go to the creator of the platform, and the reply appears here.

type Ticket = { id: string; subject: string; category: string; status: string; updatedAt: string; unread: number; last: string | null }
type Message = { id: string; sender: 'admin' | 'creator'; body: string; createdAt: string }
type Thread = { ticket: { id: string; subject: string; category: string; status: string }; messages: Message[] }
type View = 'list' | 'new' | 'thread'

const FALLBACK_CATEGORIES = ['Payment problem', 'Credits not showing', 'Cannot sign in', 'Exam problem', 'Other']

const ICONS = {
  chat: 'M4 5h16v11H9l-5 4V5z M8 9h8 M8 12.5h5',
  close: 'M6 6l12 12 M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5'
}

function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
}

async function call<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/support${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('timpriest-expired'))
    const body = await response.json().catch(() => ({ error: 'Request failed.' }))
    throw new Error(body.error || 'Request failed.')
  }
  return response.json() as Promise<T>
}

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (seconds < 90) return 'just now'
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 36 * 3600) return `${Math.round(seconds / 3600)} h ago`
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
}

const statusLabel = (status: string) => (status === 'resolved' ? 'Resolved' : status === 'answered' ? 'Answered' : 'Waiting for reply')

export default function SupportWidget({ token, showNotice }: { token: string | null; showNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('list')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [unread, setUnread] = useState(0)
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES)
  const [thread, setThread] = useState<Thread | null>(null)
  const [activeId, setActiveId] = useState('')
  const [category, setCategory] = useState('Other')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const bottom = useRef<HTMLDivElement | null>(null)

  const loadList = useCallback(async () => {
    try {
      const result = await call<{ tickets: Ticket[]; unread: number; categories?: string[] }>('/tickets', token)
      setTickets(result.tickets); setUnread(result.unread); setListError('')
      if (result.categories?.length) setCategories(result.categories)
    } catch (failure) { setListError(failure instanceof Error ? failure.message : 'Could not load messages.') }
  }, [token])

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await call<Thread>(`/tickets/${id}`, token))
      setError('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load this conversation.') }
  }, [token])

  // check for replies every so often, even while the panel is closed, so the badge stays up to date
  useEffect(() => {
    void loadList()
    const interval = window.setInterval(() => void loadList(), 45000)
    return () => window.clearInterval(interval)
  }, [loadList])

  useEffect(() => {
    if (!open || view !== 'thread' || !activeId) return
    void loadThread(activeId)
    const interval = window.setInterval(() => void loadThread(activeId), 12000)
    return () => window.clearInterval(interval)
  }, [open, view, activeId, loadThread])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [thread?.messages.length, view])

  const openPanel = () => { setOpen(true); setView('list'); void loadList() }
  const openThread = (id: string) => { setActiveId(id); setThread(null); setReply(''); setError(''); setView('thread') }
  const goList = () => { setView('list'); setActiveId(''); setThread(null); setError(''); void loadList() }

  const sendNew = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await call<{ id: string }>('/tickets', token, { method: 'POST', body: JSON.stringify({ category, subject, message }) })
      setSubject(''); setMessage(''); setCategory('Other')
      showNotice('Message sent. The creator will reply here.')
      await loadList(); openThread(result.id)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not send your message.') } finally { setBusy(false) }
  }

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeId) return
    setBusy(true); setError('')
    try {
      await call(`/tickets/${activeId}/messages`, token, { method: 'POST', body: JSON.stringify({ body: reply }) })
      setReply('')
      await loadThread(activeId); void loadList()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not send your reply.') } finally { setBusy(false) }
  }

  const resolve = async () => {
    if (!activeId) return
    setBusy(true)
    try { await call(`/tickets/${activeId}/resolve`, token, { method: 'POST', body: '{}' }); await loadThread(activeId); void loadList(); showNotice('Marked as resolved.') } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this message.') } finally { setBusy(false) }
  }

  return (
    <>
      <button className="sp-fab" type="button" onClick={() => (open ? setOpen(false) : openPanel())} aria-label="Help and support">
        <Icon name={open ? 'close' : 'chat'} size={26} />
        {!open && unread > 0 && <span className="sp-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <section className="sp-panel" role="dialog" aria-label="Help and support">
          <header className="sp-head">
            {view !== 'list' && <button className="sp-icon-btn" type="button" onClick={goList} aria-label="Back"><Icon name="back" size={20} /></button>}
            <div>
              <strong>{view === 'new' ? 'New message' : view === 'thread' ? (thread?.ticket.subject || 'Conversation') : 'Help & support'}</strong>
              <small>{view === 'thread' && thread ? `${thread.ticket.category} · ${statusLabel(thread.ticket.status)}` : 'Write to the creator of TIMPRIEST EDU'}</small>
            </div>
            <button className="sp-icon-btn right" type="button" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={20} /></button>
          </header>

          {view === 'list' && (
            <div className="sp-body">
              <button className="sp-primary" type="button" onClick={() => { setError(''); setView('new') }}><Icon name="plus" size={18} />New message</button>
              {listError && <p className="sp-error">{listError}</p>}
              {!listError && tickets.length === 0 && <div className="sp-empty"><strong>No messages yet</strong><span>Have a problem with payments, credits or signing in? Tell us, and the creator will reply right here.</span></div>}
              <div className="sp-list">
                {tickets.map((ticket) => (
                  <button className={`sp-ticket ${ticket.unread ? 'unread' : ''}`} key={ticket.id} type="button" onClick={() => openThread(ticket.id)}>
                    <div className="sp-ticket-top"><strong>{ticket.subject}</strong><small>{ago(ticket.updatedAt)}</small></div>
                    <span className="sp-snippet">{ticket.last}</span>
                    <div className="sp-ticket-foot"><span className={`sp-chip ${ticket.status}`}>{statusLabel(ticket.status)}</span>{ticket.unread > 0 && <span className="sp-new">New reply</span>}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === 'new' && (
            <form className="sp-body sp-form" onSubmit={sendNew}>
              <p className="sp-hint">What is this about?</p>
              <div className="sp-cats">{categories.map((name) => <button key={name} type="button" className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}</button>)}</div>
              <label>Title<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. My credits did not change" maxLength={120} required /></label>
              <label>Your message<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what happened. Include the date and the amount if it is about a payment." rows={6} maxLength={2000} required /></label>
              {error && <p className="sp-error">{error}</p>}
              <button className="sp-primary" type="submit" disabled={busy}><Icon name="send" size={18} />{busy ? 'Sending...' : 'Send message'}</button>
            </form>
          )}

          {view === 'thread' && (
            <div className="sp-thread">
              <div className="sp-messages">
                {!thread && !error && <p className="sp-hint">Loading...</p>}
                {thread?.messages.map((item) => (
                  <div key={item.id} className={`sp-bubble ${item.sender}`}>
                    <span className="sp-who">{item.sender === 'admin' ? 'You' : 'Support (creator)'}</span>
                    <p>{item.body}</p>
                    <small>{ago(item.createdAt)}</small>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              {error && <p className="sp-error">{error}</p>}
              <form className="sp-reply" onSubmit={sendReply}>
                <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder={thread?.ticket.status === 'resolved' ? 'Write here to reopen this conversation' : 'Write a reply'} rows={2} maxLength={2000} required />
                <div className="sp-reply-actions">
                  {thread && thread.ticket.status !== 'resolved' && <button type="button" className="sp-ghost" onClick={() => void resolve()} disabled={busy}><Icon name="check" size={16} />Mark resolved</button>}
                  <button className="sp-primary small" type="submit" disabled={busy}><Icon name="send" size={16} />Send</button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </>
  )
}
