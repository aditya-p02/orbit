export const rel = (t: number, now: number): string => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 1) return 'now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s ago`
}

export const clock = (t: number): string =>
  new Date(t).toLocaleTimeString('en-GB', { hour12: false })
