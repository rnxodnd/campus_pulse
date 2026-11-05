import { useEffect, useRef, useState } from 'react'
import { scaleAt } from '../data/spots'

const SPEED = 7 // 1초에 화면 폭의 몇 % 움직일지
const FRAME_MS = 180 // 걷는 그림 2장 바꾸는 간격

// 곰 한 마리: 바닥 구역 안을 랜덤으로 걸어다님
// start: 처음 위치, enter: 화면 밖에서 걸어 들어오는지, leaving: 화면 밖으로 걸어 나가는 중인지
// pickTarget: 다음에 갈 자리(다른 곰과 떨어진 곳)를 골라 줌, reportPos: 지금 서 있는 자리를 알려 줌(null = 자리 비움)
export default function Bear({ frames, zone, start, enter, leaving, onExit, pickTarget, reportPos }) {
  const [pos, setPos] = useState(start)
  const [walk, setWalk] = useState({ moving: false, duration: 0 })
  const [facing, setFacing] = useState(1)
  const [frame, setFrame] = useState(0)
  const posRef = useRef(start)
  const enteredRef = useRef(!enter)

  useEffect(() => {
    let alive = true
    const timers = new Set()
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t)
        if (alive) fn()
      }, ms)
      timers.add(t)
    }

    function walkTo(target, then) {
      const cur = posRef.current
      const dx = target.x - cur.x
      const dy = (target.y - cur.y) * 1.6
      const duration = Math.max(0.8, Math.hypot(dx, dy) / SPEED)
      if (Math.abs(dx) > 0.5) setFacing(dx < 0 ? -1 : 1)
      posRef.current = target
      setWalk({ moving: true, duration })
      setPos(target)
      later(() => {
        setWalk({ moving: false, duration: 0 })
        then?.()
      }, duration * 1000)
    }

    if (leaving) {
      reportPos(null)
      const exitX = posRef.current.x < 50 ? -12 : 112
      walkTo({ x: exitX, y: posRef.current.y }, onExit)
    } else {
      const wander = () => later(() => walkTo(pickTarget(), wander), 600 + Math.random() * 2600)
      if (!enteredRef.current) {
        later(() => {
          enteredRef.current = true
          walkTo(pickTarget(), wander)
        }, 50)
      } else {
        reportPos(posRef.current)
        wander()
      }
    }

    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [leaving, zone, onExit, pickTarget, reportPos])

  // 걷는 동안 그림 2장을 번갈아 보여줌
  useEffect(() => {
    if (!walk.moving) return undefined
    const t = setInterval(() => setFrame((f) => 1 - f), FRAME_MS)
    return () => clearInterval(t)
  }, [walk.moving])

  const d = walk.duration
  return (
    <div
      className="bear"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        zIndex: Math.round(pos.y * 10),
        transform: `translate(-50%, -100%) scale(${scaleAt(pos.y, zone)})`,
        transition: walk.moving ? `left ${d}s linear, top ${d}s linear, transform ${d}s linear` : 'none',
      }}
    >
      <div className="bear-flip" style={{ transform: `scaleX(${facing})` }}>
        <img className={walk.moving ? 'walking' : ''} src={frames[frame]} alt="" draggable={false} />
      </div>
    </div>
  )
}
