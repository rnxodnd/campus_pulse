// 곰들이 바닥(walkZone) 위에서 서 있을 자리를 고르는 도우미

export function randomIn(zone) {
  return {
    x: zone.xMin + Math.random() * (zone.xMax - zone.xMin),
    y: zone.yMin + Math.random() * (zone.yMax - zone.yMin),
  }
}

// 화면이 세로로 길어서 y 1%가 x 1%보다 실제로 더 길다 → 거리 계산 때 y에 가중치
const Y_WEIGHT = 2.2

function distance(a, b) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * Y_WEIGHT)
}

// 후보 자리를 여러 개 뽑고, 다른 곰들과 가장 멀리 떨어진 곳을 고름
// → 무작위지만 한쪽에 뭉치지 않고 바닥 전체에 고르게 퍼짐
export function spreadPoint(zone, others, tries = 12) {
  if (others.length === 0) return randomIn(zone)
  let best = null
  let bestDist = -1
  for (let i = 0; i < tries; i++) {
    const p = randomIn(zone)
    let nearest = Infinity
    for (const o of others) nearest = Math.min(nearest, distance(p, o))
    if (nearest > bestDist) {
      bestDist = nearest
      best = p
    }
  }
  return best
}

// 원근감: 화면 위쪽(멀리)은 작게, 아래쪽(가까이)은 크게
export function scaleAt(y, zone) {
  const t = (y - zone.yMin) / (zone.yMax - zone.yMin)
  return 0.55 + 0.5 * Math.min(1, Math.max(0, t))
}
