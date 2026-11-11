import { describe, expect, it } from 'vitest'
import { formatNumberInput, groupNumber } from './format'

describe('meeting number formatting', () => {
  it('groups meeting numbers and limits pasted input to nine digits', () => {
    expect(groupNumber('123456789')).toBe('123 456 789')
    expect(formatNumberInput('123-456 789 000')).toBe('123 456 789')
    expect(formatNumberInput('12a34')).toBe('123 4')
  })
})
