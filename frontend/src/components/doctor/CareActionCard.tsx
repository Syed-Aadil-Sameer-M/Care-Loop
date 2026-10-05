import { ArrowDown, CalendarDays, GitBranch, Stethoscope } from 'lucide-react'
import { Badge } from '../common/Badge'
import { StatusBadge } from '../common/StatusBadge'
import type { CareAction } from '../../types'
import { ConfidenceBar } from './ConfidenceBar'

export function CareActionCard({
  action,
  held = false,
}: {
  action: CareAction
  held?: boolean
}) {
  const actionType = action.type

  return (
    <article className={`care-action-card${held ? ' care-action-card--held' : ''}`}>
      <div className="care-action-card__header">
        <div className="care-action-card__title-group">
          <span className="care-action-card__icon" aria-hidden="true">
            <Stethoscope size={17} />
          </span>
          <div>
            {action.description && <h3>{action.description}</h3>}
            {actionType && (
              <span className="care-action-card__type">{actionType}</span>
            )}
          </div>
        </div>
        {action.state && <StatusBadge state={action.state} />}
      </div>

      <div className="care-action-card__badges">
        {action.category && <Badge tone="blue">{action.category}</Badge>}
        {action.department && <Badge>{action.department}</Badge>}
      </div>

      {typeof action.confidence === 'number' && (
        <ConfidenceBar value={action.confidence} />
      )}

      {typeof action.drop_risk === 'number' && (
        <ConfidenceBar value={action.drop_risk} label="Drop risk" />
      )}

      {action.deadline_at && (
        <div className="care-action-card__detail">
          <CalendarDays size={14} aria-hidden="true" />
          <span>Deadline</span>
          <time dateTime={action.deadline_at}>{action.deadline_at}</time>
        </div>
      )}

      {action.scheduled_slot && (
        <div className="care-action-card__detail">
          <CalendarDays size={14} aria-hidden="true" />
          <span>Scheduled slot</span>
          <span>{action.scheduled_slot}</span>
        </div>
      )}

      {action.depends_on && action.depends_on.length > 0 && (
        <div className="care-action-card__dependencies">
          <div className="care-action-card__detail">
            <GitBranch size={14} aria-hidden="true" />
            <span>Depends on</span>
          </div>
          <ul>
            {action.depends_on.map((dependency) => (
              <li key={dependency}>
                <ArrowDown size={12} aria-hidden="true" />
                {dependency}
              </li>
            ))}
          </ul>
        </div>
      )}
      {action.result_text && (
        <div className="care-action-card__result">
          <strong>Result</strong>
          <p>{action.result_text}</p>
        </div>
      )}
    </article>
  )
}
