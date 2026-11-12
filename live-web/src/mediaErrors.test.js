import { describe, expect, it } from 'vitest'
import { mediaError, requestError } from './mediaErrors'

describe('user-facing errors', () => {
  it.each([
    ['NotAllowedError', 'mic', '允许设备权限'],
    ['PermissionDeniedError', 'camera', '允许设备权限'],
    ['NotFoundError', 'camera', '没有检测到'],
    ['DevicesNotFoundError', 'mic', '没有检测到'],
    ['NotReadableError', 'mic', '被其他应用占用'],
    ['TrackStartError', 'camera', '被其他应用占用'],
  ])('explains %s for %s', (name, operation, expected) => {
    const result = mediaError({ name }, { operation, secure: true })
    expect(result).toContain(expected)
    expect(result).not.toContain(name)
  })

  it('explains insecure pages, expired credentials and network errors', () => {
    expect(mediaError({}, { operation: 'camera', secure: false })).toContain('HTTPS')
    expect(mediaError({ status: 403 })).toContain('重新加入')
    expect(mediaError({ message: 'token expired' })).toContain('重新加入')
    expect(mediaError({ name: 'NetworkError' })).toContain('检查网络')
  })

  it('treats a dismissed screen picker as cancellation', () => {
    expect(mediaError({ name: 'NotAllowedError' }, { operation: 'screen', secure: true })).toBe('')
    expect(mediaError({ name: 'AbortError' }, { operation: 'screen', secure: true })).toBe('')
  })

  it('preserves useful Chinese API messages but hides raw exceptions', () => {
    expect(requestError(new Error('会议密码不正确'))).toBe('会议密码不正确')
    expect(requestError(new Error('Failed to fetch'))).toContain('检查网络')
    expect(requestError(new Error('连接失败 NetworkError'))).toContain('检查网络')
  })
})
