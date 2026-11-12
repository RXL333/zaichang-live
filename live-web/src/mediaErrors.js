const containsTechnicalError = /\b(?:[A-Za-z]+Error|[A-Za-z]+Exception|Failed to fetch|NetworkError)\b/i

export function requestError(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  return /[\u4e00-\u9fff]/.test(message) && !containsTechnicalError.test(message)
    ? message : '操作未完成，请检查网络后重试。'
}

export function mediaError(error, { operation = 'connect', secure = globalThis.isSecureContext !== false } = {}) {
  const name = String(error?.name || '')
  const message = String(error?.message || '')
  const device = operation === 'mic' ? '麦克风' : operation === 'camera' ? '摄像头' : '设备'
  if (!secure && operation !== 'connect') return '当前页面不是安全连接，请使用 HTTPS 或本机地址后重试。'
  // Browsers generally report a dismissed screen picker as NotAllowedError.
  if (operation === 'screen' && (name === 'NotAllowedError' || name === 'AbortError')) return ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError')
    return `无法使用${device}，请在浏览器地址栏中允许设备权限后重试。`
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
    return `没有检测到可用的${device}，请连接设备并检查系统设置。`
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return `${device}暂时无法使用，可能正被其他应用占用，请关闭其他应用后重试。`
  if (error?.status === 401 || error?.status === 403 || /token.{0,30}expir|expir.{0,30}token/i.test(message))
    return '会议凭证已失效，请返回入会页面重新加入。'
  if (operation === 'connect') return '音视频连接未能建立，请检查网络后重新连接。'
  return `${device}未能开启，请检查设备和网络后重试。`
}
