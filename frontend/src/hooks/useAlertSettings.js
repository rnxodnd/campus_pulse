import { useState } from 'react'

const STORAGE_KEY = 'campus-pulse:alert-settings:v2' // 항목이 바뀌어서 예전 저장값(v1)은 무시

// 기본값: 알림 켜짐, 두 상황 모두 체크
const DEFAULT_SETTINGS = { enabled: true, onMediumToLow: true, onHighToMedium: true }

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved && typeof saved === 'object') return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    // 저장된 값이 없거나 깨졌으면 기본값
  }
  return DEFAULT_SETTINGS
}

export function useAlertSettings() {
  const [settings, setSettings] = useState(load)

  function update(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // 저장 실패해도 화면은 정상 동작
      }
      return next
    })
  }

  return [settings, update]
}
