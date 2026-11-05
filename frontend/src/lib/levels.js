// 서버가 준 crowd_level을 화면용 글자·색으로 바꾸는 표 (판정은 서버가 함)
export const LEVELS = {
  LOW: { key: 'LOW', label: '여유', color: '#22a55b', range: '약 0 ~ 99명' },
  MEDIUM: { key: 'MEDIUM', label: '보통', color: '#f59e0b', range: '약 100 ~ 199명' },
  HIGH: { key: 'HIGH', label: '혼잡', color: '#ef4444', range: '약 200명 이상' },
}

export const NO_DATA = { key: 'NONE', label: '정보 없음', color: '#9ca3af', range: '잠시 후 다시 확인해 주세요' }

export const NOT_READY = { key: 'NONE', label: '준비 중', color: '#9ca3af', range: '곧 제공될 예정이에요' }

export function getLevelView(observation) {
  if (!observation) return NO_DATA
  if (observation.data_status === 'error' || observation.data_status === 'unknown') return NO_DATA
  return LEVELS[observation.crowd_level] ?? NO_DATA
}
