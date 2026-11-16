const key = 'zaichang.recent-meetings'
const valid = item => /^\d{9}$/.test(item?.number || '') && typeof item.title === 'string' && Number.isFinite(item.joinedAt)
const clean = item => ({ number: item.number, title: item.title.slice(0, 80), joinedAt: item.joinedAt })

export function readRecent() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter(valid).slice(0, 5).map(clean) : []
  } catch { return [] }
}
export function rememberMeeting(meeting, now = Date.now()) {
  const item = { number: String(meeting?.number || ''), title: String(meeting?.title || '会议'), joinedAt: now }
  if (!valid(item)) return readRecent()
  const recent = [clean(item), ...readRecent().filter(row => row.number !== item.number)].slice(0, 5)
  try { localStorage.setItem(key, JSON.stringify(recent)) } catch { /* The meeting remains usable without storage. */ }
  return recent
}
export function clearRecent() { try { localStorage.removeItem(key) } catch { /* Storage may be unavailable. */ } }
