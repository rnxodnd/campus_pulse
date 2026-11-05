import { useEffect, useRef, useState } from 'react'
import { scaleAt } from '../data/spots'
import { ANGRY_FRAMES } from '../data/bears'

const ENTER_SPEED = 7
const LEAVE_SPEED = 13 // 화나서 나갈 땐 더 빠르게
const FRAME_MS = 180
const FAST_FRAME_MS = 120

// 혼잡할 때 들어왔다가 곰이 너무 많은 걸 보고 화나서 나가는 곰
// 순서: 걸어 들어옴 → 멈춰서 두리번 → 화난 얼굴로 부르르 → 씩씩대며 들어온 쪽으로 퇴장
export default function VisitorBear({ visitor, zone, onDone }) {
  const { frames, fromLeft, y } = visitor
  const edgeX = fromLeft ? -12 : 112
  const [pos, setPos] = useState({ x: edgeX, y })
  const [walk, setWalk] = useState({ moving: false, duration: 0 })
  const [facing, setFacing] = useState(fromLeft ? 1 : -1)
  const [phase, setPhase] = useState('enter') // enter | look | fume | leave
  const [frame, setFrame] = useState(0)
  const posRef = useRef({ x: edgeX, y })

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

    function walkTo(target, speed, then) {
      const cur = posRef.current
      const duration = Math.max(0.6, Math.abs(target.x - cur.x) / speed)
      setFacing(target.x < cur.x ? -1 : 1)
      posRef.current = target
      setWalk({ moving: true, duration })
      setPos(target)
      later(() => {
        setWalk({ moving: false, duration: 0 })
        then()
      }, duration * 1000)
    }

    const insideX = fromLeft ? 16 + Math.random() * 10 : 84 - Math.random() * 10
    later(() => {
      walkTo({ x: insideX, y }, ENTER_SPEED, () => {
        // 두리번두리번
        setPhase('look')
        later(() => setFacing((f) => -f), 450)
        later(() => setFacing((f) => -f), 900)
        // 곰이 너무 많아! → 화남
        later(() => setPhase('fume'), 1350)
        later(() => {
          setPhase('leave')
          walkTo({ x: edgeX, y }, LEAVE_SPEED, onDone)
        }, 2400)
      })
    }, 50)

    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [edgeX, fromLeft, y, onDone])

  useEffect(() => {
    if (!walk.moving) return undefined
    const ms = phase === 'leave' ? FAST_FRAME_MS : FRAME_MS
    const t = setInterval(() => setFrame((f) => 1 - f), ms)
    return () => clearInterval(t)
  }, [walk.moving, phase])

  const angry = phase === 'fume' || phase === 'leave'
  const src = angry ? ANGRY_FRAMES[phase === 'fume' ? 0 : frame] : frames[walk.moving ? frame : 0]
  const imgClass = phase === 'fume' ? 'fuming' : walk.moving ? 'walking' : ''
  const d = walk.duration

  return (
    <div
      className="bear"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        zIndex: Math.round(pos.y * 10),
        transform: `translate(-50%, -100%) scale(${scaleAt(pos.y, zone)})`,
        transition: walk.moving ? `left ${d}s linear, top ${d}s linear` : 'none',
      }}
    >
      <div className="bear-flip" style={{ transform: `scaleX(${facing})` }}>
        <img className={imgClass} src={src} alt="" draggable={false} />
      </div>
    </div>
  )
}
