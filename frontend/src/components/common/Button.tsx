import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

interface ButtonProps
  extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button className={`button button--${variant} ${className}`} {...props}>
      {children}
    </button>
  )
}
