export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="inline-status" role="status">
      <span className="loading-dot" aria-hidden="true" />
      {label}
    </div>
  )
}
