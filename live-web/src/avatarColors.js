// The same account keeps the same color across the stage, member list and chat.
export const avatarPalette = ['#315844', '#40586b', '#614e64', '#65503d', '#545d38', '#714b50', '#3a5e5a', '#5c526b']

export function avatarColor(userId) {
  let hash = 2166136261
  for (const char of String(userId || '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619)
  return avatarPalette[(hash >>> 0) % avatarPalette.length]
}

export function avatarStyle(userId) { return { backgroundColor: avatarColor(userId), color: '#ffffff' } }
