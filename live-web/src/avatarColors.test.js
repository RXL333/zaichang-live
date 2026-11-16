import { describe, expect, it } from 'vitest'
import { avatarColor, avatarPalette } from './avatarColors'

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(c => parseInt(c, 16) / 255)
  return rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0)
}

describe('avatar colors', () => {
  it('uses eight consistent colors with sufficient white-text contrast', () => {
    expect(new Set(avatarPalette).size).toBe(8)
    for (const color of avatarPalette) expect(1.05 / (luminance(color) + .05)).toBeGreaterThanOrEqual(4.5)
    expect(avatarColor('user-123')).toBe(avatarColor('user-123'))
    expect(new Set(Array.from({ length: 32 }, (_, n) => avatarColor(`user-${n}`))).size).toBeGreaterThan(1)
  })
})
