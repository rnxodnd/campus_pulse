import { useCallback, useEffect, useState } from 'react'
import HomePage from './pages/HomePage'
import AlertSettingsPage from './pages/AlertSettingsPage'
import AlertHistoryPage from './pages/AlertHistoryPage'
import FacilityMenu from './components/FacilityMenu'
import AlertToast from './components/AlertToast'
import { useAlertSettings } from './hooks/useAlertSettings'
import { useAlertHistory } from './hooks/useAlertHistory'
import { useCongestion } from './hooks/useCongestion'
import { useLevelChange } from './hooks/useLevelChange'
import { makeAlert, shouldNotify, showBrowserNotification } from './data/alerts'
import { DEFAULT_FACILITY_ID, FACILITIES, findFacility } from './data/facilities'
import './App.css'

const STORAGE_KEY = 'campus-pulse:facility'
const TOAST_MS = 5000

function loadFacilityId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && FACILITIES.some((f) => f.id === saved)) return saved
  } catch {
    // 저장소를 못 쓰는 환경이면 기본값 사용
  }
  return DEFAULT_FACILITY_ID
}

export default function App() {
  const [facilityId, setFacilityId] = useState(loadFacilityId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [screen, setScreen] = useState('home') // 'home' | 'settings' | 'history'
  const [toast, setToast] = useState(null)
  const [historyBack, setHistoryBack] = useState('settings') // 알림 내역에서 ← 누르면 돌아갈 화면
  const [alertSettings, updateAlertSettings] = useAlertSettings()
  const alerts = useAlertHistory()
  const facility = findFacility(facilityId)

  // 혼잡도는 App에서 계속 받아옴 → 어느 화면에 있어도 알림이 동작
  const { data, loading } = useCongestion(facility.id, { enabled: facility.ready })
  const observation = data?.observation ?? null

  // 혼잡도 단계가 바뀌면: 알림 켜져 있으면 내역에 기록, 설정에 맞으면 알림 표시
  useLevelChange(facility.id, observation, (from, to) => {
    if (!alertSettings.enabled) return
    const alert = makeAlert(facility, from, to)
    alerts.add(alert)
    if (screen === 'history') alerts.markSeen() // 내역을 보고 있으면 바로 읽음 처리
    if (shouldNotify(alertSettings, alert)) {
      setToast(alert)
      showBrowserNotification(alert)
    }
  })

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  function selectFacility(id) {
    setFacilityId(id)
    setMenuOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // 저장 실패해도 화면은 정상 동작
    }
  }

  function openHistory(from) {
    setToast(null)
    alerts.markSeen()
    setHistoryBack(from)
    setScreen('history')
  }

  return (
    <div className="app-shell">
      <main className="phone">
        <HomePage
          facility={facility}
          observation={observation}
          loading={loading}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenAlerts={() => setScreen('settings')}
          hasUnread={alerts.hasUnread}
        />
        <FacilityMenu
          open={menuOpen}
          selectedId={facilityId}
          onSelect={selectFacility}
          onClose={closeMenu}
        />
        {screen === 'settings' && (
          <AlertSettingsPage
            settings={alertSettings}
            onChange={updateAlertSettings}
            onBack={() => setScreen('home')}
            onOpenHistory={() => openHistory('settings')}
          />
        )}
        {screen === 'history' && (
          <AlertHistoryPage
            history={alerts.history}
            onBack={() => setScreen(historyBack)}
            onClear={alerts.clear}
          />
        )}
        <AlertToast alert={toast} onClick={() => openHistory(screen === 'history' ? historyBack : screen)} onClose={() => setToast(null)} />
      </main>
    </div>
  )
}
