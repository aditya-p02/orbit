import { useState, useEffect } from 'react'
import type { State } from '../data'
import { stateColor } from '../data'

export function Panel({
  title,
  hint,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string
  hint?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`bg-card rounded-2xl border border-border/60 shadow-sm ${className}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/50 px-6 py-4 rounded-t-2xl">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {hint && (
            <span className="text-xs text-muted-foreground">{hint}</span>
          )}
        </div>
        {right}
      </header>
      <div className={`p-6 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function StateBadge({ state, small }: { state: State; small?: boolean }) {
  const c = stateColor[state]
  const label = state.charAt(0) + state.slice(1).toLowerCase()
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
      }`}
      style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      {label}
    </span>
  )
}

export function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, score)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function MetricCard({
  label,
  value,
  sub,
  color = 'text-foreground',
  icon,
  delay = 0,
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
  icon: React.ReactNode
  delay?: number
}) {
  const [displayed, setDisplayed] = useState(0)
  const numVal = typeof value === 'number' ? value : NaN

  useEffect(() => {
    if (isNaN(numVal)) return
    const timer = setTimeout(() => {
      let start = 0
      const end = numVal
      const duration = 800
      const startTime = performance.now()
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplayed(Math.round(start + (end - start) * eased))
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => clearTimeout(timer)
  }, [numVal, delay])

  return (
    <div
      className="bg-card rounded-2xl p-5 card-shadow border border-border/60 flex flex-col gap-3 hover:card-shadow-lg transition-all duration-200 hover:-translate-y-0.5 animate-slide-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</span>
        <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <div className={`text-3xl font-bold tabular-nums tracking-tight ${color}`}>
        {isNaN(numVal) ? value : displayed.toLocaleString()}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}