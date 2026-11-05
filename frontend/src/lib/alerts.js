import { LEVELS } from './levels'

// 혼잡도 변화 → 알림 문구·색
const CHANGE_TEXT = {
  LOW: { text: '여유로워짐', color: '#22a55b' },
  MEDIUM: { text: '보통으로 변경', color: '#f59e0b' },
  HIGH: { text: '혼잡해짐', color: '#ef4444' },
}

export function makeAlert(facility, from, to) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    facilityId: facility.id,
    facilityName: facility.name,
    from,
    to,
    at: new Date().toISOString(),
  }
}

export function describeAlert(alert) {
  const change = CHANGE_TEXT[alert.to]
  return {
    title: `${alert.facilityName} 혼잡도 변경`,
    fromLabel: LEVELS[alert.from]?.label ?? '',
    toText: change?.text ?? '',
    color: change?.color ?? '#6b7280',
  }
}

// 설정에 따라 알림(토스트·브라우저 알림)을 띄울지
// 보통→여유, 혼잡→보통 각각 선택. 혼잡→여유로 바로 바뀌면 둘 중 하나만 켜져 있어도 알림
export function shouldNotify(settings, alert) {
  if (!settings.enabled) return false
  const { from, to } = alert
  if (from === 'MEDIUM' && to === 'LOW') return settings.onMediumToLow
  if (from === 'HIGH' && to === 'MEDIUM') return settings.onHighToMedium
  if (from === 'HIGH' && to === 'LOW') return settings.onMediumToLow || settings.onHighToMedium
  return false
}

export function showBrowserNotification(alert) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const d = describeAlert(alert)
  try {
    new Notification('Campus Pulse', {
      body: `${d.title}\n${d.fromLabel} → ${d.toText}`,
      icon: '/favicon.svg',
      tag: alert.facilityId,
    })
  } catch {
    // 일부 모바일 브라우저는 이 방식을 지원하지 않음 (PWA 단계에서 보완). 앱 안 알림은 그대로 표시됨
  }
}
