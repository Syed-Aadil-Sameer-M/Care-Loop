import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { JourneyActionRecord } from '../../hooks/useJourneyActionRecords'
import type { DepartmentCompletionResponse } from '../../types'
import { ApiError } from '../../services/api'
import { Button } from '../common/Button'
import { StatusBadge } from '../common/StatusBadge'

interface DepartmentActionCardProps {
  record: JourneyActionRecord
  onComplete: (
    actionId: string,
    resultText: string,
  ) => Promise<DepartmentCompletionResponse>
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'This action cannot be completed from its current backend state.'
  }
  if (error instanceof ApiError && error.status === 400) {
    return 'The backend rejected the action ID or result text.'
  }
  if (
    error instanceof Error &&
    error.message === 'Backend not connected. Check the API URL and server.'
  ) {
    return 'Backend is unavailable. No completion is confirmed.'
  }
  return 'The backend did not confirm completion. The action state will be refreshed.'
}

function getFailureDetails(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return []
  return [
    ['Failure type', meta.failure_type],
    ['Failure severity', meta.failure_severity],
    ['Explanation', meta.explanation],
    ['Original error', meta.original_error],
    ['Failure reason', meta.failure_reason],
  ].filter((entry): entry is [string, string] => isText(entry[1]))
}

export function DepartmentActionCard({
  record,
  onComplete,
}: DepartmentActionCardProps) {
  const { action, journey } = record
  const [resultDraft, setResultDraft] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] =
    useState<DepartmentCompletionResponse | null>(null)
  const canComplete = ['SCHEDULED', 'IN_PROGRESS'].includes(action.state)
  const bookingIsExecutorManaged =
    ['VALIDATED', 'ASSIGNED'].includes(action.state) && Boolean(action.department)
  const failureDetails = getFailureDetails(action.meta)
  const retryCount =
    typeof action.retry_count === 'number' &&
    Number.isInteger(action.retry_count) &&
    action.retry_count >= 0
      ? action.retry_count
      : null

  async function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const resultText = resultDraft.trim()
    if (!resultText || isPending) return

    setIsPending(true)
    setError(null)
    try {
      const response = await onComplete(action.id, resultText)
      setConfirmation(response)
      setResultDraft('')
    } catch (completionError) {
      setError(getErrorMessage(completionError))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <article
      className={`department-action${action.state === 'ESCALATED' ? ' department-action--escalated' : ''}`}
    >
      <div className="department-action__top">
        <div>
          <strong>{action.description || action.type || 'Care action'}</strong>
          {action.type && <span>{action.type}</span>}
        </div>
        <StatusBadge state={action.state} />
      </div>

      <dl className="department-action__details">
        <div>
          <dt>Patient</dt>
          <dd>{journey.patients?.name || journey.patient_id}</dd>
        </div>
        <div>
          <dt>Journey</dt>
          <dd>{journey.id}</dd>
        </div>
        <div>
          <dt>Action ID</dt>
          <dd>{action.id}</dd>
        </div>
        {action.department && (
          <div>
            <dt>Department</dt>
            <dd>{action.department}</dd>
          </div>
        )}
        {typeof action.confidence === 'number' && (
          <div>
            <dt>Confidence</dt>
            <dd>{Math.round(action.confidence * 100)}%</dd>
          </div>
        )}
        {action.scheduled_slot && (
          <div>
            <dt>Scheduled slot</dt>
            <dd>{action.scheduled_slot}</dd>
          </div>
        )}
        {action.deadline_at && (
          <div>
            <dt>Deadline</dt>
            <dd>
              <time dateTime={action.deadline_at}>
                {new Date(action.deadline_at).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
        {retryCount !== null && (
          <div>
            <dt>Self-healing</dt>
            <dd>
              {retryCount > 0 && retryCount <= 3
                ? `Retry ${retryCount} of 3`
                : `Retry count: ${retryCount}`}
            </dd>
          </div>
        )}
        {typeof action.drop_risk === 'number' &&
          Number.isFinite(action.drop_risk) &&
          action.drop_risk >= 0 &&
          action.drop_risk <= 1 && (
            <div>
              <dt>Drop risk</dt>
              <dd>{Math.round(action.drop_risk * 100)}%</dd>
            </div>
          )}
      </dl>

      {action.state === 'ESCALATED' && (
        <div className="department-action__failure" role="status">
          <AlertCircle size={15} aria-hidden="true" />
          <strong>Escalated for coordinator attention.</strong>
        </div>
      )}

      {bookingIsExecutorManaged && (
        <div className="department-booking">
          <Button
            type="button"
            variant="secondary"
            disabled
            title="The backend executor owns booking and the subsequent action-state transition."
          >
            Book Slot
          </Button>
          <span>
            Booking is routed by the backend agent. Calling the slot endpoint
            directly could reserve a duplicate slot without updating this
            action.
          </span>
        </div>
      )}

      {failureDetails.length > 0 && (
        <section className="department-action__failure-details">
          <strong>Backend failure details</strong>
          <dl>
            {failureDetails.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {action.result_text && (
        <div className="department-action__result">
          <CheckCircle2 size={15} aria-hidden="true" />
          <div>
            <strong>Backend result</strong>
            <p>{action.result_text}</p>
          </div>
        </div>
      )}

      {canComplete && (
        <form className="department-completion" onSubmit={submitCompletion}>
          <label htmlFor={`result-${action.id}`}>Department result</label>
          <textarea
            id={`result-${action.id}`}
            value={resultDraft}
            onChange={(event) => setResultDraft(event.target.value)}
            placeholder="Enter the result reported by this department"
            rows={2}
            required
            disabled={isPending}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={isPending || !resultDraft.trim()}
          >
            {isPending ? (
              <LoaderCircle className="button-spinner" size={15} />
            ) : (
              <CheckCircle2 size={15} aria-hidden="true" />
            )}
            {isPending ? 'Submitting result…' : 'Complete action'}
          </Button>
          <p className="department-completion__note">
            Completion is confirmed only after the backend accepts the result.
          </p>
          {error && (
            <div className="inline-validation" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              {error}
            </div>
          )}
        </form>
      )}

      {confirmation && (
        <div className="department-action__complete" role="status">
          <strong>
            Backend confirmed {confirmation.state} for action{' '}
            {confirmation.action_id}.
          </strong>
          <p>{confirmation.result_text}</p>
          {confirmation.anomaly_check_triggered && (
            <span>Backend anomaly check triggered.</span>
          )}
        </div>
      )}
    </article>
  )
}
