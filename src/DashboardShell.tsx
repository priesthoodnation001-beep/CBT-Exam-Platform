import type { ReactNode } from 'react'
import './shells.css'

export type ShellRole = 'Admin' | 'Teacher' | 'Student'

type Props = {
  role: ShellRole
  centre: string
  userName: string
  detail?: string
  items: string[]
  tab: string
  onTab: (item: string) => void
  onLogout: () => void
  menuOpen: boolean
  onMenu: (open: boolean) => void
  children: ReactNode
}

const ICONS: Record<string, string> = {
  Overview: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
  Accounts: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1 M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M20 20v-1a3 3 0 0 0-2-2.8 M16 5.2a3 3 0 0 1 0 5.6',
  Schedule: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  'My exams': 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h6',
  Questions: 'M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z M9.5 19h5 M10.5 21.5h3',
  Approvals: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z M9 12l2.2 2.2L15.5 10',
  Results: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  Billing: 'M3 6h18v12H3z M3 10h18 M7 15h3',
  Profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  logout: 'M9 4H5v16h4 M16 8l4 4-4 4 M20 12H9',
  menu: 'M4 7h16 M4 12h16 M4 17h16'
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ICONS.Overview} /></svg>
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'

const SIDE_NOTE: Record<ShellRole, string> = {
  Admin: 'Administrator console',
  Teacher: 'Teacher workspace',
  Student: 'Student portal'
}

// One shell per role. The pages inside it (children) are the same working screens as before.
export default function DashboardShell({ role, centre, userName, detail, items, tab, onTab, onLogout, menuOpen, onMenu, children }: Props) {
  if (role === 'Student') {
    return (
      <div className="ds ds-student">
        <header className="ds-sbar">
          <div className="ds-sbar-in">
            <div className="ds-brand"><img src="/logo.svg" alt="" /><div><strong>TIMPRIEST EDU</strong><small>{centre}</small></div></div>
            <nav className="ds-pills" aria-label="Student pages">
              {items.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => onTab(item)}><Icon name={item} size={18} />{item}</button>)}
            </nav>
            <div className="ds-sbar-right">
              <div className="ds-who"><span className="ds-avatar">{initials(userName)}</span><div><strong>{userName}</strong>{detail && <small>{detail}</small>}</div></div>
              <button className="ds-out" onClick={onLogout}><Icon name="logout" size={18} /><span>Log out</span></button>
            </div>
          </div>
        </header>
        <main className="ds-smain">{children}</main>
      </div>
    )
  }

  return (
    <div className={`ds ds-${role.toLowerCase()} ${menuOpen ? 'open' : ''}`}>
      <aside className="ds-side">
        <div className="ds-brand"><img src="/logo.svg" alt="" /><div><strong>TIMPRIEST EDU</strong><small>{SIDE_NOTE[role]}</small></div></div>
        <div className="ds-centre"><span className="ds-dot" /><div><strong>{centre}</strong><small>{role} portal</small></div></div>
        <nav className="ds-nav" aria-label={`${role} pages`}>
          {items.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => { onTab(item); onMenu(false) }}><Icon name={item} />{item}</button>)}
        </nav>
        <div className="ds-side-foot">
          <button className="ds-logout" onClick={onLogout}><Icon name="logout" />Log out</button>
          <div className="ds-user"><span className="ds-avatar">{initials(userName)}</span><div><strong>{userName}</strong><small>{role}</small></div></div>
        </div>
      </aside>
      {menuOpen && <div className="ds-backdrop" onClick={() => onMenu(false)} />}
      <div className="ds-main">
        <header className="ds-top">
          <button className="ds-burger" type="button" aria-label="Open or close the menu" onClick={() => onMenu(!menuOpen)}><Icon name="menu" size={22} /></button>
          <div className="ds-crumb"><strong>{tab}</strong><span>{role === 'Admin' ? 'Administrator' : 'Teacher'}</span></div>
          <div className="ds-top-right"><span className="ds-online"><span className="ds-dot" />Connected</span><span className="ds-avatar small">{initials(userName)}</span></div>
        </header>
        <main className="ds-content">{children}</main>
      </div>
    </div>
  )
}
