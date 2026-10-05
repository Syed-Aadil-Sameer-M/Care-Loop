import { AlertTriangle, Gauge } from 'lucide-react'
import type { JourneyActionRecord } from '../../hooks/useJourneyActionRecords'
import { EmptyState } from '../common/EmptyState'

export function DropRiskPanel({
  records,
}: {
  records: JourneyActionRecord[]
}) {
  const riskRecords = records.filter(
    ({ action }) =>
      typeof action.drop_risk === 'number' &&
      Number.isFinite(action.drop_risk) &&
      action.drop_risk >= 0 &&
      action.drop_risk <= 1,
  )

  return (
    <section className="drop-risk-panel" aria-labelledby="drop-risk-title">
      <div className="dashboard-section-heading">
        <span className="dashboard-section-heading__icon" aria-hidden="true">
          <Gauge size={17} />
        </span>
        <div>
          <h2 id="drop-risk-title">Predictive drop risk</h2>
          <p>
            Backend-returned scores only. No risk thresholds are configured in
            this frontend.
          </p>
        </div>
      </div>

      {riskRecords.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title="Predictive scoring unavailable"
          description="No numeric drop-risk values were returned. Risk scoring is awaiting backend data."
        />
      ) : (
        <ul className="drop-risk-list">
          {riskRecords.map(({ action, journey }) => {
            const risk = action.drop_risk
            if (typeof risk !== 'number') return null
            const percentage = Math.round(risk * 100)

            return (
              <li className="drop-risk-item" key={action.id}>
                <div className="drop-risk-item__main">
                  <strong>{action.description || action.type || 'Care action'}</strong>
                  <span>
                    {journey.patients?.name || journey.patient_id} · Journey{' '}
                    {journey.id}
                  </span>
                </div>
                <div
                  className="drop-risk-score"
                  aria-label={`Backend drop-risk score ${percentage} percent`}
                >
                  {percentage}%
                  <small>Backend score</small>
                </div>
                <div className="drop-risk-item__details">
                  {action.department && <span>{action.department}</span>}
                  {action.deadline_at && (
                    <time dateTime={action.deadline_at}>
                      Deadline {action.deadline_at}
                    </time>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
