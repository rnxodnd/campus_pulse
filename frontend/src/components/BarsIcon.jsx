export default function BarsIcon({ color, size = 24 }) {
  return (
    <svg width={size} height={(size * 22) / 24} viewBox="0 0 24 22" aria-hidden="true">
      <rect x="1" y="13" width="5" height="8" rx="1.5" fill={color} />
      <rect x="9.5" y="7" width="5" height="14" rx="1.5" fill={color} />
      <rect x="18" y="1" width="5" height="20" rx="1.5" fill={color} />
    </svg>
  )
}
