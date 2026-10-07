import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react'

interface CardProps extends PropsWithChildren<HTMLAttributes<HTMLElement>> {
  title?: string
  description?: string
  action?: ReactNode
}

export function Card({
  title,
  description,
  action,
  children,
  className = '',
  ...props
}: CardProps) {
  return (
    <section className={`card ${className}`} {...props}>
      {(title || description || action) && (
        <div className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {description && <p className="card__description">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
