import { AlertTriangle } from 'lucide-react'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'

export function AnomalyReviewPanel() {
  return (
    <Card
      title="Plan anomaly review"
      description="Compare a returned result with the active care plan when verified anomaly data is available."
    >
      <EmptyState
        icon={<AlertTriangle size={20} />}
        title="Anomaly review unavailable"
        description="No anomaly result, severity, explanation, or confirmation endpoint is available from the current backend. No anomaly has been inferred."
      />
    </Card>
  )
}
