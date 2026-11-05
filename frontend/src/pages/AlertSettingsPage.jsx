import { useState } from 'react'
import PageHeader from '../components/PageHeader'

// 브라우저 알림 권한 안내 (권한이 없을 때만 보임)
function NotificationPermission() {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState(supported ? Notification.permission : 'unsupported')

  if (permission === 'granted') return null

  async function request() {
    try {
      setPermission(await Notification.requestPermission())
    } catch {
      setPermission('denied')
    }
  }

  let text = '폰·PC 알림을 받으려면 브라우저 알림을 허용해 주세요.'
  if (permission === 'denied') text = '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'
  if (permission === 'unsupported') text = '이 브라우저는 알림을 지원하지 않아요. 앱 안에서만 알려드려요.'

  return (
    <div className="card permission-card">
      <span>{text}</span>
      {permission === 'default' && (
        <button className="permission-btn" onClick={request}>허용하기</button>
      )}
    </div>
  )
}

function CheckRow({ checked, disabled, onChange, title, desc }) {
  return (
    <label className={`check-row ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="check-text">
        <span className="check-title">{title}</span>
        <span className="check-desc">{desc}</span>
      </span>
    </label>
  )
}

export default function AlertSettingsPage({ settings, onChange, onBack, onOpenHistory }) {
  const off = !settings.enabled

  return (
    <section className="page">
      <PageHeader title="알림 설정" onBack={onBack} />

      <div className="page-body">
        <div className="card toggle-card">
          <svg className="toggle-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <div className="toggle-text">
            <span className="toggle-title">혼잡도 알림</span>
            <span className="toggle-desc">식당의 혼잡도 변화 시 알림을 받아요.</span>
          </div>
          <button
            className={`switch ${settings.enabled ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.enabled}
            aria-label="혼잡도 알림"
            onClick={() => onChange({ enabled: !settings.enabled })}
          >
            <span className="switch-knob" />
          </button>
        </div>

        {settings.enabled && <NotificationPermission />}

        <h2 className="section-title">알림 받을 상황 선택</h2>
        <div className="card">
          <CheckRow
            checked={settings.onMediumToLow}
            disabled={off}
            onChange={(v) => onChange({ onMediumToLow: v })}
            title="보통 → 여유로 바뀔 때"
            desc="자리가 넉넉해지면 알려드려요"
          />
          <CheckRow
            checked={settings.onHighToMedium}
            disabled={off}
            onChange={(v) => onChange({ onHighToMedium: v })}
            title="혼잡 → 보통으로 바뀔 때"
            desc="붐비던 식당이 조금 풀리면 알려드려요"
          />
        </div>

        <p className="section-note">혼잡에서 바로 여유로 바뀌면 둘 중 하나만 켜져 있어도 알려드려요.</p>

        <button className="card link-row" onClick={onOpenHistory}>
          <span>알림 내역 보기</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </section>
  )
}
