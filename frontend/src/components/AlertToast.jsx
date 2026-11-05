import { describeAlert } from '../lib/alerts'

// 앱 안에서 위에서 내려오는 알림 (설계도 ⑧⑨ 모양)
export default function AlertToast({ alert, onClick, onClose }) {
  if (!alert) return null
  const d = describeAlert(alert)

  return (
    <div className="toast" role="status">
      <button className="toast-body" onClick={onClick}>
        <span className="toast-app">
          <span className="toast-logo" aria-hidden="true">🔔</span>
          <strong>Campus Pulse</strong>
          <span className="toast-time">지금</span>
        </span>
        <span className="toast-title">{d.title}</span>
        <span className="toast-change">
          {d.fromLabel} →
          <span className="toast-chip" style={{ background: d.color }}>{d.toText}</span>
        </span>
      </button>
      <button className="toast-close" onClick={onClose} aria-label="알림 닫기">×</button>
    </div>
  )
}
