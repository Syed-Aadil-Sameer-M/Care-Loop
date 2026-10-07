import { Badge } from '../common/Badge'
import type { MessageIntent } from '../../types/patientSimulator'

const intentLabels: Record<MessageIntent, string> = {
  CONFIRM: 'DEMO • CONFIRM',
  RESCHEDULE: 'DEMO • RESCHEDULE',
  URGENT: 'DEMO • URGENT',
  NOT_CLASSIFIED: 'NOT CLASSIFIED',
}

const intentTones: Record<
  MessageIntent,
  'neutral' | 'teal' | 'amber' | 'red' | 'blue'
> = {
  CONFIRM: 'teal',
  RESCHEDULE: 'blue',
  URGENT: 'red',
  NOT_CLASSIFIED: 'neutral',
}

export function IntentBadge({ intent }: { intent: MessageIntent }) {
  return (
    <Badge tone={intentTones[intent]}>
      <span className="intent-badge">{intentLabels[intent]}</span>
    </Badge>
  )
}
