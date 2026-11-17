import { useState, type FormEvent, type ReactNode } from 'react'
import StudentCsvImport from './StudentCsvImport'
import PasswordInput from './PasswordInput'
import { STUDENT_SECTIONS } from './studentSections'

type Role = 'Admin' | 'Teacher' | 'Student'
type Account = { id: string; role: Role; name: string; username?: string; studentId?: string; classSection?: string }
type AccountRole = 'Teacher' | 'Student'
type Props = { accounts: Account[]; token: string | null; selectedRole: AccountRole | null; onSelectRole: (role: AccountRole) => void; showForm: boolean; setShowForm: (value: boolean) => void; addAccount: (event: FormEvent<HTMLFormElement>) => void; updateAccount: (account: Account, values: { name: string; username: string; password: string; studentId: string; classSection: string }) => Promise<boolean>; deleteAccount: (account: Account) => void; refresh: () => Promise<void>; showNotice: (message: string) => void }

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
}

function printStudentRoster(students: Account[]) {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) return
  const grouped = new Map<string, Account[]>()
  for (const student of [...students].sort((left, right) => (left.classSection || '').localeCompare(right.classSection || '') || left.name.localeCompare(right.name))) {
    const section = student.classSection || 'Unassigned'
    if (!grouped.has(section)) grouped.set(section, [])
    grouped.get(section)?.push(student)
  }
  const sections = Array.from(grouped, ([section, members]) => `<section><h2>${escapeHtml(section)}</h2><table><thead><tr><th>No.</th><th>Student name</th><th>Student ID</th></tr></thead><tbody>${members.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.studentId || '-')}</td></tr>`).join('')}</tbody></table></section>`).join('')
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>TIMPRIEST EDU Student Register</title><style>@page{margin:18mm}body{font-family:Arial,sans-serif;color:#20372a}h1{color:#17492a;border-bottom:2px solid #d7a443;padding-bottom:12px}h2{margin:24px 0 8px;color:#17492a}p{color:#647568}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd6cc;padding:8px;text-align:left}th{background:#f0f5f0}tbody tr:nth-child(even){background:#f8faf8}</style></head><body><h1>TIMPRIEST EDU Student Register</h1><p>${students.length} registered students · Printed ${new Date().toLocaleDateString()}</p>${sections}</body></html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.onafterprint = () => printWindow.close()
  printWindow.print()
}

export default function AccountsPanel({ accounts, token, selectedRole, onSelectRole, showForm, setShowForm, addAccount, updateAccount, deleteAccount, refresh, showNotice }: Props) {
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const teachers = accounts.filter((account) => account.role === 'Teacher')
  const students = accounts.filter((account) => account.role === 'Student')

  async function saveAccountEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingAccount || savingEdit) return
    const values = new FormData(event.currentTarget)
    setSavingEdit(true)
    try {
      const saved = await updateAccount(editingAccount, {
        name: String(values.get('name') || '').trim(),
        username: String(values.get('username') || '').trim(),
        password: String(values.get('password') || ''),
        studentId: String(values.get('studentId') || '').trim().toUpperCase(),
        classSection: String(values.get('classSection') || '').trim()
      })
      if (saved) setEditingAccount(null)
    } finally {
      setSavingEdit(false)
    }
  }

  const accountTable = (rows: Account[], accountRole: 'Teacher' | 'Student', beforeTable?: ReactNode) => {
    const isStudent = accountRole === 'Student'
    return (
      <section className="account-group" aria-labelledby={`${accountRole.toLowerCase()}-accounts-heading`}>
        <div className="account-group-heading">
          <div>
            <p className="eyebrow">Access management</p>
            <h3 id={`${accountRole.toLowerCase()}-accounts-heading`}>{accountRole} accounts</h3>
          </div>
          <span className="account-count">{rows.length} {rows.length === 1 ? 'account' : 'accounts'}</span>
        </div>
        {beforeTable}
        <div className="table-panel">
          <div className={`table-head account-row ${isStudent ? 'student-account-row' : 'teacher-account-row'}`}>
            <span>Name</span>
            {isStudent ? <><span>Student ID</span><span>Class</span></> : <span>Username</span>}
            <span>Action</span>
          </div>
          {rows.length === 0
            ? <p className="account-empty">No {accountRole.toLowerCase()} accounts yet.</p>
            : rows.map((account) => (
              <div className={`table-row account-row ${isStudent ? 'student-account-row' : 'teacher-account-row'}`} key={account.id}>
                <strong>{account.name}</strong>
                {isStudent
                  ? <><span>{account.studentId || '-'}</span><span>{account.classSection || '-'}</span></>
                  : <span>{account.username || '-'}</span>}
                <details className="account-actions">
                  <summary aria-label={`Actions for ${account.name}`} title="Account actions"><span /><span /><span /></summary>
                  <div className="account-actions-menu">
                    <button type="button" onClick={(event) => { setEditingAccount(account); setShowForm(false); event.currentTarget.closest('details')?.removeAttribute('open') }}>Edit</button>
                    <button type="button" className="account-actions-delete" onClick={() => deleteAccount(account)}>Delete</button>
                  </div>
                </details>
              </div>
            ))}
        </div>
      </section>
    )
  }

  return (
    <>
      <div className="section-heading">
        <div><p className="eyebrow">Access management</p><h2>{selectedRole ? `Manage ${selectedRole.toLowerCase()} accounts` : 'Manage accounts'}</h2></div>
        {selectedRole && <div className="account-heading-actions">
          {selectedRole === 'Student' && <button className="secondary-button" type="button" onClick={() => printStudentRoster(students)} disabled={!students.length}>Print student register</button>}
          <button className="primary-button" onClick={() => setShowForm(!showForm)}>+ Create {selectedRole.toLowerCase()} account</button>
        </div>}
      </div>
      {!selectedRole ? (
        <div className="account-page-grid">
          <button className="account-page-card" onClick={() => onSelectRole('Teacher')}>
            <span className="account-page-icon" aria-hidden="true">T</span>
            <span className="account-page-copy"><strong>Teacher accounts</strong><small>Create and manage teacher logins</small></span>
            <span className="account-page-count">{teachers.length}</span>
            <span className="account-page-arrow" aria-hidden="true">→</span>
          </button>
          <button className="account-page-card" onClick={() => onSelectRole('Student')}>
            <span className="account-page-icon" aria-hidden="true">S</span>
            <span className="account-page-copy"><strong>Student accounts</strong><small>Create, import, and manage student logins</small></span>
            <span className="account-page-count">{students.length}</span>
            <span className="account-page-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      ) : showForm && (
        <form className="form-panel" onSubmit={addAccount}>
          <h3>Create {selectedRole.toLowerCase()} login credentials</h3>
          <div className="form-grid">
            <input type="hidden" name="role" value={selectedRole} />
            <label>Full name<input name="name" required placeholder="Enter full name" /></label>
            {selectedRole === 'Teacher' && (
              <>
                <label>Username<input name="username" required autoComplete="off" placeholder="Choose a username" /></label>
                <label>Password<PasswordInput name="password" required minLength={6} autoComplete="new-password" placeholder="At least 6 characters" /></label>
              </>
            )}
            {selectedRole === 'Student' && (
              <>
                <label>Student ID<input name="studentId" required placeholder="e.g. STU-001" /></label>
                <label>Class section<select name="classSection" required defaultValue=""><option value="" disabled>Select a class section</option>{STUDENT_SECTIONS.map((section) => <option key={section}>{section}</option>)}</select></label>
              </>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="primary-button" type="submit">Create login</button>
          </div>
        </form>
      )}
      {editingAccount && selectedRole === editingAccount.role && (
        <form className="form-panel account-edit-form" onSubmit={saveAccountEdit}>
          <h3>Edit {editingAccount.role.toLowerCase()} account</h3>
          <div className="form-grid">
            <label>Full name<input name="name" required defaultValue={editingAccount.name} /></label>
            {editingAccount.role === 'Teacher' ? (
              <>
                <label>Username<input name="username" required autoComplete="off" defaultValue={editingAccount.username || ''} /></label>
                <label>New password (optional)<PasswordInput name="password" minLength={6} autoComplete="new-password" placeholder="Leave blank to keep current password" /></label>
              </>
            ) : (
              <>
                <label>Student ID<input name="studentId" required defaultValue={editingAccount.studentId || ''} /></label>
                <label>Class section
                  <select name="classSection" required defaultValue={editingAccount.classSection || ''}>
                    {!STUDENT_SECTIONS.includes(editingAccount.classSection as typeof STUDENT_SECTIONS[number]) && editingAccount.classSection && <option>{editingAccount.classSection}</option>}
                    {STUDENT_SECTIONS.map((section) => <option key={section}>{section}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-button" disabled={savingEdit} onClick={() => setEditingAccount(null)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      )}
      {selectedRole === 'Teacher' && accountTable(teachers, 'Teacher')}
      {selectedRole === 'Student' && accountTable(students, 'Student', <StudentCsvImport token={token} refresh={refresh} showNotice={showNotice} />)}
    </>
  )
}
