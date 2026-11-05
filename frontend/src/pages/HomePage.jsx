import TopBar from '../components/TopBar'
import StatusBadge from '../components/StatusBadge'
import BearCrowd from '../components/BearCrowd'
import { getLevelView, NOT_READY } from '../data/levels'
import { BEARS_BY_LEVEL } from '../data/bears'

const TYPE_EMOJI = { cafeteria: '🍽️', library: '📚', building: '🏢' }

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 혼잡도 데이터는 App에서 받아서 넘겨줌 (알림 기능과 같이 쓰기 위해)
export default function HomePage({ facility, observation, loading, onOpenMenu, onOpenAlerts, hasUnread }) {
  const view = facility.ready ? getLevelView(observation) : NOT_READY
  const background = facility.background
  const bearCount = facility.walkZone ? BEARS_BY_LEVEL[view.key] ?? 0 : 0

  let meta = `${facility.name}`
  if (observation?.captured_at) meta += ` · ${formatTime(observation.captured_at)} 기준`
  if (observation?.data_status === 'delayed') meta += ' · 업데이트 지연'

  return (
    <div className={`home level-${view.key.toLowerCase()} ${background ? 'has-bg' : ''}`}>
      <div
        className="home-bg"
        style={background ? { backgroundImage: `url(${background})` } : undefined}
      >
        {!background && <span className="home-bg-emoji">{TYPE_EMOJI[facility.type] ?? '🏫'}</span>}
      </div>

      {facility.walkZone && <BearCrowd key={facility.id} count={bearCount} zone={facility.walkZone} crowded={view.key === 'HIGH'} />}

      <TopBar onMenu={onOpenMenu} onBell={onOpenAlerts} hasUnread={hasUnread} />
      <StatusBadge view={view} loading={facility.ready && loading} />
      <div className="home-meta">{meta}</div>
    </div>
  )
}
