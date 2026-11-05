export default function PageHeader({ title, onBack }) {
  return (
    <header className="page-header">
      <button className="page-back" onClick={onBack} aria-label="뒤로 가기">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <h1 className="page-title">{title}</h1>
      <span />
    </header>
  )
}
