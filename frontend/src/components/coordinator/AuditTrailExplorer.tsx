import { ClipboardCheck } from 'lucide-react'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'

export function AuditTrailExplorer() {
  return (
    <Card
      title="Audit trail"
      description="Recorded state transitions and retries require a read API before they can be explored here."
    >
      <EmptyState
        icon={<ClipboardCheck size={20} />}
        title="Audit trail integration pending backend endpoint."
        description="The backend writes audit records internally, but GET /api/audit/:journeyId is not implemented in this checkout."
      />
      <p className="integration-fields">
        Ready to display timestamp, actor, event, reason, journey, action, and
        metadata when provided by the backend.
      </p>
    </Card>
  )
}
