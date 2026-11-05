import BarsIcon from './BarsIcon'

export default function StatusBadge({ view, loading }) {
  return (
    <div className="status-badge" aria-live="polite">
      <div className="status-main">
        <BarsIcon color={view.color} />
        <span>현재 ·</span>
        <span style={{ color: view.color }}>{loading ? '확인 중' : view.label}</span>
      </div>
      <div className="status-sub">{loading ? '잠시만 기다려 주세요' : view.range}</div>
    </div>
  )
}
