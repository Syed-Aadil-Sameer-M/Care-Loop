import { useEffect, useRef, useState } from 'react'

interface AnimatedMetricProps {
  value: number | string | undefined
  className?: string
}

export function AnimatedMetric({
  value,
  className = '',
}: AnimatedMetricProps) {
  const numericValue =
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const [prefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const displayedValue = useRef(0)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (numericValue === null) return

    const start = displayedValue.current
    const duration = 360
    let frame = 0
    let startTime: number | null = null

    if (prefersReducedMotion) {
      displayedValue.current = numericValue
      return
    }

    const animate = (time: number) => {
      if (startTime === null) startTime = time
      const progress = Math.min((time - startTime) / duration, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      const nextValue = start + (numericValue - start) * easedProgress

      displayedValue.current = nextValue
      setCount(progress === 1 ? numericValue : nextValue)

      if (progress < 1) frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [numericValue, prefersReducedMotion])

  if (numericValue === null) {
    return <span className={className}>{value ?? '—'}</span>
  }

  return (
    <span className={className}>
      {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
        prefersReducedMotion ? numericValue : count,
      )}
    </span>
  )
}
