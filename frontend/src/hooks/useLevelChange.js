import { useEffect, useRef } from 'react'

// 시설의 혼잡도 단계가 바뀌면 onChange(이전 단계, 새 단계) 호출
// 처음 받은 값은 기준으로만 저장하고 알림을 만들지 않음
export function useLevelChange(facilityId, observation, onChange) {
  const lastLevels = useRef({})
  const callback = useRef(onChange)

  useEffect(() => {
    callback.current = onChange
  })

  const level = observation?.data_status === 'current' ? observation.crowd_level : null

  useEffect(() => {
    if (!level) return
    const prev = lastLevels.current[facilityId]
    lastLevels.current[facilityId] = level
    if (prev && prev !== level) callback.current(prev, level)
  }, [facilityId, level])
}
