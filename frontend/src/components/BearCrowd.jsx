import { useCallback, useEffect, useRef, useState } from 'react'
import Bear from './Bear'
import VisitorBear from './VisitorBear'
import { randomVisitorSprite, spriteFor } from '../lib/bears'
import { spreadPoint } from '../lib/spots'

let nextId = 0

// 혼잡할 때 들렀다 화나서 나가는 손님 곰
const MAX_VISITORS = 4 // 한 번에 최대 몇 마리
const FIRST_WAIT_MS = [2000, 5000] // 혼잡이 되고 첫 손님이 오기까지
const NEXT_WAIT_MS = [1000, 3000] // 다음 손님이 오기까지 (하나씩 순서대로 들어옴)

const between = ([min, max]) => min + Math.random() * (max - min)

// 다른 손님들과 높이가 겹치지 않게 y를 고름
function visitorY(zone, others) {
  const top = zone.yMin + 0.3 * (zone.yMax - zone.yMin)
  let best = top
  let bestGap = -1
  for (let i = 0; i < 8; i++) {
    const y = top + Math.random() * (zone.yMax - top)
    const gap = others.length ? Math.min(...others.map((o) => Math.abs(o.y - y))) : 0
    if (others.length === 0) return y
    if (gap > bestGap) {
      bestGap = gap
      best = y
    }
  }
  return best
}

function makeBear(index, zone, enter, others) {
  const spot = spreadPoint(zone, others)
  const start = enter ? { x: Math.random() < 0.5 ? -12 : 112, y: spot.y } : spot
  return { id: nextId++, frames: spriteFor(index), start, enter, leaving: false }
}

// count 수만큼 곰을 보여줌. 늘어나면 걸어 들어오고, 줄어들면 걸어 나감
// crowded: 혼잡일 때 true → 손님 곰(최대 4마리)이 하나씩 들어왔다가 화나서 나감
export default function BearCrowd({ count, zone, crowded = false }) {
  const [bears, setBears] = useState([])
  const [shown, setShown] = useState(0)
  const [visitors, setVisitors] = useState([])
  const spotsRef = useRef(new Map()) // 곰 id → 지금 서 있거나 가는 중인 자리

  // count가 바뀌었을 때 곰 목록 조정 (렌더 중 상태 조정 패턴)
  if (count !== shown) {
    const first = shown === 0 && bears.every((b) => b.leaving)
    setShown(count)
    setBears((prev) => {
      const active = prev.filter((b) => !b.leaving)
      if (count > active.length) {
        const others = active.map((b) => b.start)
        const added = []
        for (let i = active.length; i < count; i++) {
          const bear = makeBear(i, zone, !first, others)
          others.push(bear.start)
          added.push(bear)
        }
        return [...prev, ...added]
      }
      let toRemove = active.length - count
      return prev
        .slice()
        .reverse()
        .map((b) => {
          if (!b.leaving && toRemove > 0) {
            toRemove -= 1
            return { ...b, leaving: true }
          }
          return b
        })
        .reverse()
    })
  }

  const remove = useCallback((id) => {
    spotsRef.current.delete(id)
    setBears((prev) => prev.filter((b) => b.id !== id))
  }, [])

  // 다른 곰들과 떨어진 자리를 골라서 예약
  const pickTarget = useCallback(
    (id) => {
      const others = []
      spotsRef.current.forEach((spot, key) => {
        if (key !== id) others.push(spot)
      })
      const spot = spreadPoint(zone, others)
      spotsRef.current.set(id, spot)
      return spot
    },
    [zone],
  )

  const reportPos = useCallback((id, pos) => {
    if (pos) spotsRef.current.set(id, pos)
    else spotsRef.current.delete(id)
  }, [])

  // 혼잡하면 손님 곰을 하나씩 들여보냄 (최대 MAX_VISITORS마리, 나가면 다시 채움)
  const visitorCount = visitors.length
  useEffect(() => {
    if (!crowded || visitorCount >= MAX_VISITORS) return undefined
    const wait = between(visitorCount === 0 ? FIRST_WAIT_MS : NEXT_WAIT_MS)
    const t = setTimeout(() => {
      setVisitors((prev) => {
        if (prev.length >= MAX_VISITORS) return prev
        return [
          ...prev,
          {
            id: nextId++,
            frames: randomVisitorSprite(),
            fromLeft: Math.random() < 0.5,
            y: visitorY(zone, prev),
          },
        ]
      })
    }, wait)
    return () => clearTimeout(t)
  }, [crowded, visitorCount, zone])

  const visitorDone = useCallback((id) => setVisitors((prev) => prev.filter((v) => v.id !== id)), [])

  return (
    <div className="bear-layer" aria-hidden="true">
      {bears.map((b) => (
        <BearItem key={b.id} bear={b} zone={zone} onRemove={remove} pickTarget={pickTarget} reportPos={reportPos} />
      ))}
      {visitors.map((v) => (
        <VisitorItem key={v.id} visitor={v} zone={zone} onDone={visitorDone} />
      ))}
    </div>
  )
}

function BearItem({ bear, zone, onRemove, pickTarget, reportPos }) {
  const { id } = bear
  const onExit = useCallback(() => onRemove(id), [onRemove, id])
  const pick = useCallback(() => pickTarget(id), [pickTarget, id])
  const report = useCallback((pos) => reportPos(id, pos), [reportPos, id])
  return (
    <Bear
      frames={bear.frames}
      zone={zone}
      start={bear.start}
      enter={bear.enter}
      leaving={bear.leaving}
      onExit={onExit}
      pickTarget={pick}
      reportPos={report}
    />
  )
}

function VisitorItem({ visitor, zone, onDone }) {
  const { id } = visitor
  const done = useCallback(() => onDone(id), [onDone, id])
  return <VisitorBear visitor={visitor} zone={zone} onDone={done} />
}
