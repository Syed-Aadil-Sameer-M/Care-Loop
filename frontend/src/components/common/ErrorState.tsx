import { AlertCircle } from 'lucide-react'

export function ErrorState({
  title = 'Something went wrong',
  description,
}: {
  title?: string
  description: string
}) {
  return (
    <div className="notice notice--error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  )
}
