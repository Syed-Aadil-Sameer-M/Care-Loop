import type { PropsWithChildren } from 'react'

interface BadgeProps extends PropsWithChildren {
  tone?: 'neutral' | 'teal' | 'amber' | 'red' | 'blue'
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}
