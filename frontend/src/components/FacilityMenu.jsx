import { useEffect } from 'react'
import { FACILITIES } from '../lib/facilities'

function FacilityIcon({ type }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (type === 'cafeteria') {
    return (
      <svg {...common}>
        <path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7a2 2 0 0 1-2 2M8 3v6" />
        <path d="M17 21V3c-2 1.5-3 4-3 7a3 3 0 0 0 3 3" />
      </svg>
    )
  }
  if (type === 'library') {
    return (
      <svg {...common}>
        <path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z" />
        <path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 21V5l8-3v19M12 21h8V9l-8-3" />
      <path d="M7 9h2M7 13h2M7 17h2M15 12h2M15 16h2" />
    </svg>
  )
}

export default function FacilityMenu({ open, selectedId, onSelect, onClose }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`drawer-root ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-overlay" onClick={onClose} />
      <nav className="drawer" aria-label="시설 선택">
        <div className="drawer-header">
          <span className="drawer-title">
            <FacilityIcon type="building" />
            시설 선택
          </span>
          <button className="drawer-close" onClick={onClose} aria-label="닫기" tabIndex={open ? 0 : -1}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <ul className="drawer-list">
          {FACILITIES.map((f) => {
            const selected = f.id === selectedId
            return (
              <li key={f.id}>
                <button
                  className={`drawer-item ${selected ? 'selected' : ''}`}
                  onClick={() => onSelect(f.id)}
                  aria-current={selected ? 'true' : undefined}
                  tabIndex={open ? 0 : -1}
                >
                  <FacilityIcon type={f.type} />
                  <span className="drawer-item-name">{f.name}</span>
                  {!f.ready && !selected && <span className="drawer-item-tag">준비 중</span>}
                  {selected && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
