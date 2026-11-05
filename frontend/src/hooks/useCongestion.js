import { useEffect, useState } from 'react'
import { fetchFacility } from '../api/client'

// intervalMs 마다 시설의 최신 혼잡도를 가져옴
export function useCongestion(facilityId, { enabled = true, intervalMs = 5000 } = {}) {
  const [result, setResult] = useState({ facilityId: null, data: null, error: null })

  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    async function load() {
      try {
        const data = await fetchFacility(facilityId)
        if (alive) setResult({ facilityId, data, error: null })
      } catch (error) {
        if (alive) setResult((prev) => ({ ...prev, facilityId, error }))
      }
    }
    load()
    const timer = setInterval(load, intervalMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [facilityId, enabled, intervalMs])

  // 시설을 바꾼 직후에는 이전 시설 데이터를 보여주지 않음
  if (!enabled || result.facilityId !== facilityId) return { data: null, error: null, loading: enabled }
  return { data: result.data, error: result.error, loading: false }
}
