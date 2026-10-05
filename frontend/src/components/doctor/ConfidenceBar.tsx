export function ConfidenceBar({
  value,
  label = 'Confidence',
}: {
  value: number
  label?: string
}) {
  const percentage = value <= 1 ? value * 100 : value
  const boundedPercentage = Math.min(100, Math.max(0, percentage))
  const roundedPercentage = Math.round(boundedPercentage)

  return (
    <div className="confidence">
      <div className="confidence__labels">
        <span>{label}</span>
        <strong>{roundedPercentage}%</strong>
      </div>
      <div
        className="confidence__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedPercentage}
        aria-valuetext={`${roundedPercentage}%`}
      >
        <span
          className="confidence__fill"
          style={{ width: `${boundedPercentage}%` }}
        />
      </div>
    </div>
  )
}
