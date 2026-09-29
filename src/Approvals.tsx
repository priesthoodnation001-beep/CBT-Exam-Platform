type SubjectSetting = { subject: string; duration: number; approved: number; approved_at?: string }

type ApprovalsProps = { subjects: SubjectSetting[]; approve: (subject: string) => void; deleteSubject: (subject: string) => void }

export default function Approvals({ subjects, approve, deleteSubject }: ApprovalsProps) {
  return <>
    <div className="section-heading"><div><p className="eyebrow">Quality control</p><h2>Approve subject questions</h2></div></div>
    <div className="approval-list">
      {subjects.length === 0 && <div className="result-empty"><span>✦</span><h3>No subject question sets yet</h3><p>Teacher question sets will appear here after they submit a subject.</p></div>}
      {subjects.map((item) => <article className="approval-card" key={item.subject}><div><span className="role-pill teacher">{item.duration} minute limit</span><h3>{item.subject}</h3><p>{item.approved ? `Approved${item.approved_at ? ` on ${new Date(item.approved_at).toLocaleDateString()}` : ''}. Students can access this subject.` : 'Pending approval. Students cannot access this subject yet.'}</p></div><div className="approval-actions">{item.approved ? <span className="tag live">Approved</span> : <button className="primary-button small-button" onClick={() => approve(item.subject)}>Approve questions</button>}<button className="delete-button" onClick={() => deleteSubject(item.subject)}>Delete set</button></div></article>)}
    </div>
  </>
}
