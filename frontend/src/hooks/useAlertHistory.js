import { useState } from 'react'

const HISTORY_KEY = 'campus-pulse:alert-history'
const SEEN_KEY = 'campus-pulse:alert-seen-at'
const MAX_ITEMS = 50

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장 실패해도 화면은 정상 동작
  }
}

// 알림 내역 (최신순) + 안 읽은 알림 여부
export function useAlertHistory() {
  const [history, setHistory] = useState(() => loadJson(HISTORY_KEY, []))
  const [seenAt, setSeenAt] = useState(() => loadJson(SEEN_KEY, null))

  function add(alert) {
    setHistory((prev) => {
      const next = [alert, ...prev].slice(0, MAX_ITEMS)
      save(HISTORY_KEY, next)
      return next
    })
  }

  function markSeen() {
    const now = new Date().toISOString()
    setSeenAt(now)
    save(SEEN_KEY, now)
  }

  function clear() {
    setHistory([])
    save(HISTORY_KEY, [])
  }

  const hasUnread = history.some((a) => !seenAt || a.at > seenAt)

  return { history, add, markSeen, clear, hasUnread }
}
