// 백엔드 API 호출 (개발 중에는 vite.config.js 프록시가 /api 를 백엔드로 넘겨줌)
export async function fetchFacility(id) {
  const res = await fetch(`/api/facilities/${encodeURIComponent(id)}`)
  if (res.status === 404) return { facility: null, observation: null }
  if (!res.ok) throw new Error(`API 오류: ${res.status}`)
  return res.json()
}
