import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CalendarDays, GitBranch } from 'lucide-react'
import { StatusBadge } from '../common/StatusBadge'
import type { CareActionState } from '../../types'
import type { CareActionFlowNode } from '../../utils/graph'
import { ConfidenceBar } from '../doctor/ConfidenceBar'

const stateClasses: Record<CareActionState, string> = {
  CREATED: 'care-flow-node--created',
  VALIDATED: 'care-flow-node--validated',
  HELD: 'care-flow-node--held',
  BLOCKED: 'care-flow-node--blocked',
  ASSIGNED: 'care-flow-node--assigned',
  SCHEDULED: 'care-flow-node--scheduled',
  IN_PROGRESS: 'care-flow-node--in-progress',
  COMPLETED: 'care-flow-node--completed',
  VERIFIED: 'care-flow-node--verified',
  OVERDUE: 'care-flow-node--overdue',
  ESCALATED: 'care-flow-node--escalated',
  REJECTED: 'care-flow-node--rejected',
  CANCELLED: 'care-flow-node--rejected',
}

function getStateClass(state: string): string {
  return Object.hasOwn(stateClasses, state)
    ? stateClasses[state as CareActionState]
    : 'care-flow-node--unknown'
}

export function CareActionNode({ data }: NodeProps<CareActionFlowNode>) {
  const { action } = data
  const description = action.description ?? 'Care action'

  return (
    <article
      className={`care-flow-node ${getStateClass(action.state)}`}
      role="group"
      aria-label={`${description}${action.type ? `, ${action.type}` : ''}, state ${action.state}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        aria-label={`Dependencies into ${description}`}
      />
      <div className="care-flow-node__top">
        {action.type && (
          <span className="care-flow-node__type">{action.type}</span>
        )}
        <StatusBadge state={action.state} />
      </div>
      {action.description && (
        <h3 className="care-flow-node__title">{action.description}</h3>
      )}
      <div className="care-flow-node__meta">
        {action.category && <span>{action.category}</span>}
        {action.department && <span>{action.department}</span>}
      </div>
      {typeof action.confidence === 'number' && (
        <ConfidenceBar value={action.confidence} />
      )}
      {typeof action.drop_risk === 'number' && (
        <ConfidenceBar value={action.drop_risk} label="Drop risk" />
      )}
      {action.deadline_at && (
        <div className="care-flow-node__detail">
          <CalendarDays size={12} aria-hidden="true" />
          <time dateTime={action.deadline_at}>
            {new Date(action.deadline_at).toLocaleDateString()}
          </time>
        </div>
      )}
      {action.depends_on && action.depends_on.length > 0 && (
        <div className="care-flow-node__detail">
          <GitBranch size={12} aria-hidden="true" />
          {action.depends_on.length} prerequisite
          {action.depends_on.length === 1 ? '' : 's'}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        aria-label={`Dependencies from ${description}`}
      />
    </article>
  )
}
