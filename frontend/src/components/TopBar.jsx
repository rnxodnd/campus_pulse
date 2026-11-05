export default function TopBar({ onMenu, onBell, hasUnread }) {
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={onMenu} aria-label="시설 선택 메뉴 열기">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <button className="icon-btn" onClick={onBell} aria-label="알림">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {hasUnread && <span className="dot" />}
      </button>
    </div>
  )
}
