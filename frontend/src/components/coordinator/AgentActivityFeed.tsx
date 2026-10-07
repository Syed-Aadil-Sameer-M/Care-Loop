import { Activity, Radio } from 'lucide-react'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'

export function AgentActivityFeed() {
  return (
    <Card
      title="Agent activity"
      description="A background view of verified workflow events."
    >
      <EmptyState
        icon={<Radio size={20} />}
        title="Agent activity will appear here when live activity data is available."
        description="The backend has no implemented realtime or audit-read feed in this checkout. No events are fabricated."
      />
      <p className="integration-fields">
        <Activity size={13} aria-hidden="true" />
        Integration fields: timestamp · actor · event · journey · action
      </p>
    </Card>
  )
}
