// 会议号展示为 3-3-3 分组，例如 123456789 -> "123 456 789"。
export function groupNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ')
}

// 输入框使用：只保留数字，最多 9 位，并按 3-3-3 分组。
export function formatNumberInput(value) {
  return groupNumber(String(value ?? '').replace(/\D/g, '').slice(0, 9))
}
