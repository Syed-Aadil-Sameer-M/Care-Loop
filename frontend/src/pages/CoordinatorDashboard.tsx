import {
  Activity,
  CheckCircle2,
  Clock3,
  Gauge,
  LoaderCircle,
  PanelsTopLeft,
  RefreshCw,
} from 'lucide-react'
import { useMemo } from 'react'
import { AuditTrailExplorer } from '../components/coordinator/AuditTrailExplorer'
import { DropRiskPanel } from '../components/coordinator/DropRiskPanel'
import { AgentActivityFeed } from '../components/coordinator/AgentActivityFeed'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { StatusBadge } from '../components/common/StatusBadge'
import { useJourneyActionRecords } from '../hooks/useJourneyActionRecords'
import type { JourneyActionRecord } from '../hooks/useJourneyActionRecords'
import { CoordinatorDemoControls } from '../components/coordinator/CoordinatorDemoControls'

const exceptionStates = new Set(['HELD', 'BLOCKED', 'OVERDUE', 'ESCALATED'])
const resolvedStates = new Set(['COMPLETED', 'VERIFIED'])

function getExceptionReason(meta: Record<string, unknown> | null | undefined) {
  const reasonKeys = [
    'reason',
    'failure_reason',
    'explanation',
    'original_error',
    'failure_type',
    'failure_severity',
  ] as const

  for (const key of reasonKeys) {
    const value = meta?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }

  return 'No failure reason was provided by the backend.'
}

function ExceptionItem({ record }: { record: JourneyActionRecord }) {
  const { action, journey } = record
  const patient = journey.patients?.name || journey.patient_id
  const reason = getExceptionReason(action.meta)

  return (
    <article className="exception-item">
      <div className="exception-item__top">
        <div className="exception-item__title">
          <strong>{action.description || action.type || 'Care action'}</strong>
          <StatusBadge state={action.state} />
        </div>
        <span className="exception-item__patient">{patient}</span>
      </div>

      <dl className="exception-item__details">
        <div>
          <dt>Journey</dt>
          <dd>{journey.id}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{action.id}</dd>
        </div>
        {action.department && (
          <div>
            <dt>Department</dt>
            <dd>{action.department}</dd>
          </div>
        )}
        {action.deadline_at && (
          <div>
            <dt>Deadline</dt>
            <dd>
              <time dateTime={action.deadline_at}>{action.deadline_at}</time>
            </dd>
          </div>
        )}
        {typeof action.retry_count === 'number' && (
          <div>
            <dt>Retries</dt>
            <dd>{action.retry_count}</dd>
          </div>
        )}
        {typeof action.drop_risk === 'number' && (
          <div>
            <dt>Drop risk</dt>
            <dd>{Math.round(action.drop_risk * 100)}%</dd>
          </div>
        )}
      </dl>

      <p className="exception-item__result">
        <strong>Backend reason</strong>
        {reason}
      </p>
      {action.result_text && (
        <p className="exception-item__result">
          <strong>Latest result</strong>
          {action.result_text}
        </p>
      )}
      {action.meta && Object.keys(action.meta).length > 0 && (
        <details className="exception-item__meta">
          <summary>Additional action metadata</summary>
          <pre>{JSON.stringify(action.meta, null, 2)}</pre>
        </details>
      )}
      <p className="exception-item__resolution">
        No coordinator resolution endpoint is available for this action state.
      </p>
    </article>
  )
}

export function CoordinatorDashboard() {
  const { snapshot, isLoading, error, refresh } = useJourneyActionRecords()
  const actionRecords = useMemo(
    () => snapshot?.actionRecords ?? [],
    [snapshot],
  )
  const exceptions = useMemo(
    () =>
      actionRecords
        .filter(({ action }) => exceptionStates.has(action.state))
        .sort((left, right) => {
          const priority = ['HELD', 'BLOCKED', 'OVERDUE', 'ESCALATED']
          return (
            priority.indexOf(left.action.state) -
            priority.indexOf(right.action.state)
          )
        }),
    [actionRecords],
  )

  const metrics = useMemo(() => {
    const progressing = actionRecords.filter(({ action }) =>
      ['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(action.state),
    ).length
    const scoredActions = actionRecords.filter(
      ({ action }) =>
        typeof action.drop_risk === 'number' &&
        Number.isFinite(action.drop_risk) &&
        action.drop_risk >= 0 &&
        action.drop_risk <= 1,
    )
    return [
      {
        title: 'Active journeys',
        value: snapshot?.journeys.filter((journey) => journey.status === 'ACTIVE')
          .length,
        foot: 'Status: ACTIVE',
        icon: PanelsTopLeft,
      },
      {
        title: 'Actions being handled',
        value: progressing,
        foot: 'ASSIGNED · SCHEDULED · IN PROGRESS',
        icon: Activity,
      },
      {
        title: 'Exceptions',
        value: snapshot ? exceptions.length : undefined,
        foot: 'HELD · BLOCKED · OVERDUE · ESCALATED',
        icon: Clock3,
      },
      {
        title: 'Actions with risk scores',
        value: scoredActions.length > 0 ? scoredActions.length : 'Unavailable',
        foot:
          scoredActions.length > 0
            ? 'Backend-provided scores; no frontend risk bands'
            : 'Backend risk data unavailable',
        icon: Gauge,
      },
    ]
  }, [actionRecords, exceptions.length, snapshot])

  return (
    <div className="page-stack coordinator-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OVERSIGHT & EXCEPTIONS</div>
          <h1>Coordinator Dashboard</h1>
          <p>CareLoop is monitoring active care journeys.</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          {isLoading ? (
            <LoaderCircle className="button-spinner" size={15} />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          Refresh data
        </Button>
      </div>

      {snapshot?.refreshedAt && (
        <div className="coordinator-refresh-status" role="status">
          <Activity size={14} aria-hidden="true" />
          Journey and action data loaded · last refreshed{' '}
          <time dateTime={snapshot.refreshedAt.toISOString()}>
            {snapshot.refreshedAt.toLocaleTimeString()}
          </time>
          {isLoading && <span> · Refreshing…</span>}
        </div>
      )}

      {error && (
        <ErrorState
          title={snapshot ? 'Refresh failed' : 'Coordinator data unavailable'}
          description={
            snapshot
              ? `Could not refresh the displayed journey data. Showing the last successful response. ${error}`
              : `The coordinator view requires GET /api/journeys and its journey-detail route. ${error}`
          }
        />
      )}

      {!snapshot && isLoading && (
        <Card title="Loading coordinator data">
          <div className="coordinator-loading" role="status">
            <LoaderCircle className="button-spinner" size={18} />
            Loading journeys and their action details…
          </div>
        </Card>
      )}

      {snapshot && (
        <>
          <div className="stat-grid coordinator-stat-grid">
            {metrics.map(({ title, value, foot, icon: Icon }) => (
              <Card key={title} className="stat-card">
                <div className="stat-card__top">
                  <span className="stat-card__icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="stat-card__label">{title}</span>
                </div>
                <div className="stat-card__value">
                  {value}
                </div>
                <div className="stat-card__foot">{foot}</div>
              </Card>
            ))}
          </div>

          {exceptions.length === 0 ? (
            <section
              className={`coordinator-clear-state${
                snapshot.journeys.length === 0 || actionRecords.length === 0
                  ? ' coordinator-clear-state--neutral'
                  : ''
              }`}
              aria-live="polite"
            >
              <div className="coordinator-clear-state__icon" aria-hidden="true">
                {actionRecords.length > 0 &&
                actionRecords.every(({ action }) =>
                  resolvedStates.has(action.state),
                ) ? (
                  <CheckCircle2 size={24} />
                ) : (
                  <Activity size={24} />
                )}
              </div>
              <div>
                <Badge
                  tone={
                    snapshot.journeys.length > 0 && actionRecords.length > 0
                      ? 'teal'
                      : 'neutral'
                  }
                >
                  {snapshot.journeys.length === 0
                    ? 'NO ACTIVE JOURNEYS'
                    : actionRecords.length === 0
                      ? 'NO ACTION DATA'
                      : 'NO EXCEPTIONS'}
                </Badge>
                <h2>
                  {snapshot.journeys.length === 0
                    ? 'No active journeys are currently available.'
                    : actionRecords.length === 0
                      ? 'No action status was returned for the available journeys.'
                      : actionRecords.every(({ action }) =>
                            resolvedStates.has(action.state),
                          )
                        ? 'All reported actions are completed or verified.'
                        : 'Agent is handling all currently reported actions.'}
                </h2>
                <p>
                  {snapshot.journeys.length === 0
                    ? 'No journey or action status can be inferred from an empty journey response.'
                    : actionRecords.length === 0
                      ? 'Journey records exist, but no actions were returned. Completion and coordinator attention cannot be assessed.'
                      : '0 items need your attention. No HELD, BLOCKED, OVERDUE, or ESCALATED actions were found in the retrieved data.'}
                </p>
              </div>
            </section>
          ) : (
            <Card
              title="Human attention queue"
              description={`${exceptions.length} action${exceptions.length === 1 ? '' : 's'} in states selected for coordinator review.`}
              className="coordinator-exceptions"
            >
              <div className="exception-list">
                {exceptions.map((record) => (
                  <ExceptionItem
                    key={record.action.id}
                    record={record}
                  />
                ))}
              </div>
            </Card>
          )}

          {snapshot.journeys.length === 0 && (
            <p className="coordinator-empty-note">
              No journeys were returned. Exception counts reflect the empty
              response, not a claim that actions were completed or monitored.
            </p>
          )}

          <Card
            title="Journey overview"
            description="Patient name, patient ID, journey ID, and journey status returned by the journeys API."
          >
            {snapshot.journeys.length === 0 ? (
              <EmptyState
                title="No journeys available"
                description="The backend returned an empty journey list."
              />
            ) : (
              <div className="journey-overview-list">
                {snapshot.journeys.map((journey) => (
                  <article className="journey-overview-item" key={journey.id}>
                    <div>
                      <strong>
                        {journey.patients?.name || journey.patient_id}
                      </strong>
                      <span>Patient ID · {journey.patient_id}</span>
                    </div>
                    <span className="journey-overview-item__id">
                      Journey · {journey.id}
                    </span>
                    <Badge>{journey.status}</Badge>
                  </article>
                ))}
              </div>
            )}
          </Card>

        </>
      )}

      <DropRiskPanel records={actionRecords} />

      <div className="coordinator-grid coordinator-grid--support">
        <AuditTrailExplorer />
        <AgentActivityFeed />
      </div>

      {snapshot && (
        <CoordinatorDemoControls onActionComplete={() => void refresh()} />
      )}
    </div>
  )
}
