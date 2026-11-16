import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('meeting number font', () => {
  it('ships a small local font with an open font license', () => {
    const font = new URL('./assets/fonts/meeting-digits.ttf', import.meta.url)
    expect(statSync(font).size).toBeLessThanOrEqual(20 * 1024)
    expect(readFileSync(font).readUInt32BE(0)).toBe(0x00010000)
    expect(readFileSync(new URL('./assets/fonts/OFL.txt', import.meta.url), 'utf8')).toContain('SIL OPEN FONT LICENSE')
  })
})
