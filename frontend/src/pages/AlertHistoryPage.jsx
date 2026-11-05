import PageHeader from '../components/PageHeader'
import BarsIcon from '../components/BarsIcon'
import { describeAlert } from '../data/alerts'

function formatWhen(iso) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const today = new Date().toDateString() === d.toDateString()
  return today ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

export default function AlertHistoryPage({ history, onBack, onClear }) {
  return (
    <section className="page">
      <PageHeader title="알림 내역" onBack={onBack} />

      <div className="page-body">
        {history.length === 0 ? (
          <div className="history-empty">
            <span className="history-empty-icon" aria-hidden="true">🔔</span>
            <p>아직 받은 알림이 없어요.</p>
            <p className="history-empty-sub">혼잡도가 바뀌면 여기에 기록돼요.</p>
          </div>
        ) : (
          <>
            <ul className="history-list">
              {history.map((alert) => {
                const d = describeAlert(alert)
                return (
                  <li key={alert.id} className="card history-item">
                    <BarsIcon color={d.color} size={26} />
                    <div className="history-text">
                      <span className="history-title">{d.title}</span>
                      <span className="history-change">
                        {d.fromLabel} → <strong style={{ color: d.color }}>{d.toText}</strong>
                      </span>
                    </div>
                    <time className="history-time" dateTime={alert.at}>{formatWhen(alert.at)}</time>
                  </li>
                )
              })}
            </ul>
            <button className="history-clear" onClick={onClear}>알림 내역 전체 삭제</button>
          </>
        )}
      </div>
    </section>
  )
}
