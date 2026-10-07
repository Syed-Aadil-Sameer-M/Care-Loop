import { AlertTriangle, RotateCcw, Timer, Trophy } from 'lucide-react'
import { useState } from 'react'
import {
  activateDemoFailure,
  ApiError,
  resetDemoFailure,
} from '../../services/api'
import { Button } from '../common/Button'
import { Card } from '../common/Card'

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Force Failure is disabled by the backend unless DEMO_MODE is enabled.'
  }
  if (
    error instanceof Error &&
    error.message === 'Backend not connected. Check the API URL and server.'
  ) {
    return 'Backend is unavailable. Demo controls were not changed.'
  }
  return 'The demo-control request failed. No success is assumed.'
}

export function CoordinatorDemoControls({
  onActionComplete,
}: {
  onActionComplete: () => void
}) {
  const [pending, setPending] = useState<'reset' | 'failure' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runControl(control: 'reset' | 'failure') {
    setPending(control)
    setMessage(null)
    setError(null)
    try {
      const response =
        control === 'reset'
          ? await resetDemoFailure()
          : await activateDemoFailure()
      setMessage(response.message)
      onActionComplete()
    } catch (controlError) {
      setError(getErrorMessage(controlError))
    } finally {
      setPending(null)
    }
  }

  return (
    <Card
      title="Demo controls"
      description="Only verified backend demo controls are enabled. These do not reset or alter persisted journey data."
    >
      <div className="demo-control-list">
        <div className="demo-control-row">
          <div className="demo-control-row__copy">
            <RotateCcw size={17} aria-hidden="true" />
            <div>
              <strong>Reset failure switch</strong>
              <span>Clears the in-memory one-time failure flag only.</span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending !== null}
            onClick={() => void runControl('reset')}
          >
            {pending === 'reset' ? 'Resetting…' : 'Reset'}
          </Button>
        </div>

        <div className="demo-control-row">
          <div className="demo-control-row__copy">
            <AlertTriangle size={17} aria-hidden="true" />
            <div>
              <strong>Force next Lab booking failure</strong>
              <span>Backend rejects this unless DEMO_MODE is enabled.</span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending !== null}
            onClick={() => void runControl('failure')}
          >
            {pending === 'failure' ? 'Applying…' : 'Force Failure'}
          </Button>
        </div>

        <div className="demo-control-row demo-control-row--unavailable">
          <div className="demo-control-row__copy">
            <Timer size={17} aria-hidden="true" />
            <div>
              <strong>Fast-Forward Time</strong>
              <span>No verified time-control endpoint is available.</span>
            </div>
          </div>
          <Button type="button" variant="secondary" disabled>
            Unavailable
          </Button>
        </div>

        <div className="demo-control-row demo-control-row--unavailable">
          <div className="demo-control-row__copy">
            <Trophy size={17} aria-hidden="true" />
            <div>
              <strong>Judge Mode</strong>
              <span>No verified judge-mode endpoint is available.</span>
            </div>
          </div>
          <Button type="button" variant="secondary" disabled>
            Unavailable
          </Button>
        </div>
      </div>
      {message && (
        <p className="demo-control-feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="demo-control-feedback demo-control-feedback--error" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
