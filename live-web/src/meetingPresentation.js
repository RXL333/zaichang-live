export function formatPresentationTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function unansweredSummary(state) {
  if (!state) return ''
  return state.agenda.map(segment => {
    const questions = state.questions.filter(question => !question.answered && question.segmentId === segment.id)
    if (!questions.length) return ''
    return [
      segment.title,
      ...questions.map(question => `[${formatPresentationTime(question.elapsedMs)}] ${question.author}　${question.content}`),
    ].join('\n')
  }).filter(Boolean).join('\n\n')
}
