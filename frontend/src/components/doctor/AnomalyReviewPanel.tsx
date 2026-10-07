import { AlertTriangle, LoaderCircle, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import type { CareAction } from '../../types'
import { getHeldAnomalyDetails } from '../../utils/journey'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'

type ReviewState = 'VALIDATED' | 'REJECTED'

interface AnomalyReviewPanelProps {
  actions: CareAction[]
  onReview: (
    actionId: string,
    newState: ReviewState,
    reason: string,
  ) => Promise<void>
}

export function AnomalyReviewPanel({
  actions,
  onReview,
}: AnomalyReviewPanelProps) {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [rejectingActionId, setRejectingActionId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const anomalies = actions.flatMap((action) => {
    const details = getHeldAnomalyDetails(action)
    return details ? [{ action, details }] : []
  })

  async function submitReview(
    action: CareAction,
    newState: ReviewState,
    reason: string,
  ) {
    setPendingActionId(action.id)
    setErrorMessage(null)
    try {
      await onReview(action.id, newState, reason)
      setRejectingActionId(null)
      setRejectionReason('')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to submit the anomaly review. Please try again.',
      )
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <Card
      className="anomaly-review-panel"
      title="Plan anomaly review"
      description="Review result conflicts suggested by the system. Anomaly actions remain held until a doctor decides."
    >
      {anomalies.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={20} />}
          title="No unresolved anomalies"
          description="Anomaly reviews will appear here when a result conflicts with the active care plan."
        />
      ) : (
        <div className="anomaly-review-list">
          {anomalies.map(({ action, details }) => {
            const isPending = pendingActionId === action.id
            const isRejecting = rejectingActionId === action.id

            return (
              <article
                className="anomaly-alert"
                key={action.id}
                aria-labelledby={`anomaly-title-${action.id}`}
              >
                <div className="anomaly-alert__heading">
                  <span className="anomaly-alert__icon" aria-hidden="true">
                    <AlertTriangle size={20} />
                  </span>
                  <div className="anomaly-alert__title">
                    <div className="anomaly-alert__eyebrow">
                      ANOMALY DETECTED
                    </div>
                    <h3 id={`anomaly-title-${action.id}`}>{details.finding}</h3>
                  </div>
                  <span
                    className={`anomaly-alert__severity anomaly-alert__severity--${details.severity.toLowerCase()}`}
                  >
                    {details.severity}
                  </span>
                </div>

                <dl className="anomaly-alert__details">
                  <div>
                    <dt>Reason</dt>
                    <dd>{details.reason}</dd>
                  </div>
                  <div>
                    <dt>Suggested action</dt>
                    <dd>{details.suggested_action}</dd>
                  </div>
                  <div>
                    <dt>Department</dt>
                    <dd>{details.suggested_department}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className="anomaly-alert__status">HELD</span>
                    </dd>
                  </div>
                </dl>

                {errorMessage && (
                  <div className="anomaly-alert__error" role="alert">
                    {errorMessage}
                  </div>
                )}

                {isRejecting ? (
                  <form
                    className="anomaly-alert__reject-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const reason = rejectionReason.trim()
                      if (!reason) return
                      void submitReview(action, 'REJECTED', reason)
                    }}
                  >
                    <label htmlFor={`anomaly-reason-${action.id}`}>
                      Reason for rejection
                    </label>
                    <textarea
                      id={`anomaly-reason-${action.id}`}
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      required
                      rows={2}
                      disabled={isPending}
                    />
                    <div className="anomaly-alert__controls">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={isPending || !rejectionReason.trim()}
                      >
                        {isPending ? (
                          <LoaderCircle
                            size={15}
                            className="anomaly-alert__spinner"
                          />
                        ) : null}
                        Confirm rejection
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => {
                          setRejectingActionId(null)
                          setRejectionReason('')
                          setErrorMessage(null)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="anomaly-alert__controls">
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isPending}
                      onClick={() =>
                        void submitReview(
                          action,
                          'VALIDATED',
                          `Doctor confirmed the anomaly recommendation after review: ${details.finding}`,
                        )
                      }
                    >
                      {isPending ? (
                        <LoaderCircle
                          size={15}
                          className="anomaly-alert__spinner"
                        />
                      ) : null}
                      CONFIRM
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        setErrorMessage(null)
                        setRejectingActionId(action.id)
                      }}
                    >
                      REJECT
                    </Button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </Card>
  )
}
