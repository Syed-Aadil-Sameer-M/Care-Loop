import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Sparkles,
} from 'lucide-react'
import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { AnomalyReviewPanel } from '../components/doctor/AnomalyReviewPanel'
import { CareActionCard } from '../components/doctor/CareActionCard'
import { CaregiverContactStatus } from '../components/doctor/CaregiverContactStatus'
import { DependencyGraph } from '../components/graph/DependencyGraph'
import { DoctorNoteEditor } from '../components/doctor/DoctorNoteEditor'
import { HeldActionsPanel } from '../components/doctor/HeldActionsPanel'
import { PatientPicker } from '../components/doctor/PatientPicker'
import { useJourneyPolling } from '../hooks/useJourneyPolling'
import { useVoiceInput } from '../hooks/useVoiceInput'
import {
  ApiError,
  createJourney,
  getJourney,
  InvalidApiResponseError,
  reviewCareAction,
} from '../services/api'
import type { CareAction, CreateJourneyResponse, Patient } from '../types'
import {
  getHeldAnomalyDetails,
  includeJourneyDependencies,
} from '../utils/journey'

const DEMO_NOTE =
  'ECG, lipid profile blood test, cardiology referral, review after 7 days.'

function getSubmissionErrorMessage(error: unknown): string {
  if (error instanceof InvalidApiResponseError) {
    return 'The backend response was not in the expected format. No actions were displayed.'
  }

  if (error instanceof ApiError) {
    if (error.status === 400) {
      return 'Please check the patient ID and note and try again.'
    }

    if (error.status === 404) {
      return 'The backend could not find the requested resource. Please check the patient ID.'
    }

    if (error.status >= 500) {
      return 'Unable to extract care actions. The backend returned an error.'
    }

    return 'Unable to extract care actions. Please try again.'
  }

  if (
    error instanceof Error &&
    error.message === 'Backend not connected. Check the API URL and server.'
  ) {
    return 'Backend is unavailable. Check the API URL and try again.'
  }

  if (
    error instanceof Error &&
    error.message === 'The backend request timed out or was cancelled.'
  ) {
    return 'The extraction request timed out. Please try again.'
  }

  return 'Unable to extract care actions. Please try again.'
}

function getRefreshErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Journey details are not available yet. Live updates will retry shortly.'
  }
  if (
    error instanceof Error &&
    error.message === 'Backend not connected. Check the API URL and server.'
  ) {
    return 'Backend is unavailable. Showing the journey creation response.'
  }
  return 'Journey details could not be refreshed. Showing the journey creation response.'
}

export function DoctorConsole() {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [noteText, setNoteText] = useState('')
  const [result, setResult] = useState<CreateJourneyResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const appendVoiceTranscript = useCallback((transcript: string) => {
    setNoteText((current) =>
      current ? `${current.trimEnd()} ${transcript}` : transcript,
    )
  }, [])
  const voiceInput = useVoiceInput(appendVoiceTranscript)
  const updateJourney = useCallback(
    (journey: CreateJourneyResponse['journey'], actions: CareAction[]) => {
      setResult((current) => (current ? { journey, actions } : current))
      setDetailErrorMessage(null)
    },
    [],
  )
  const pollingError = useJourneyPolling(result?.journey.id ?? null, updateJourney)
  const refreshNotice = pollingError ?? detailErrorMessage

  const heldActions = useMemo(
    () =>
      result?.actions.filter(
        (action) =>
          action.state === 'HELD' && !getHeldAnomalyDetails(action),
      ) ?? [],
    [result],
  )
  const anomalyActions = useMemo(
    () =>
      result?.actions.filter(
        (action) => getHeldAnomalyDetails(action) !== null,
      ) ?? [],
    [result],
  )
  const otherActions = useMemo(
    () => result?.actions.filter((action) => action.state !== 'HELD') ?? [],
    [result],
  )

  const handleAnomalyReview = useCallback(
    async (
      actionId: string,
      newState: 'VALIDATED' | 'REJECTED',
      reason: string,
    ) => {
      const journeyId = result?.journey.id
      if (!journeyId) return

      const updatedAction = await reviewCareAction(actionId, newState, reason)
      setResult((current) =>
        current
          ? {
              ...current,
              actions: current.actions.map((action) =>
                action.id === actionId
                  ? { ...updatedAction, depends_on: action.depends_on }
                  : action,
              ),
            }
          : current,
      )

      try {
        const details = await getJourney(journeyId)
        updateJourney(
          details.journey,
          includeJourneyDependencies(details.actions, details.dependencies),
        )
      } catch (refreshError) {
        setDetailErrorMessage(getRefreshErrorMessage(refreshError))
      }
    },
    [result?.journey.id, updateJourney],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setValidationMessage(null)

    const cleanNoteText = noteText.trim()

    if (!patient) {
      setValidationMessage('Select a patient before extracting care actions.')
      return
    }

    if (!cleanNoteText) {
      setValidationMessage('Enter a clinical note before extracting care actions.')
      return
    }

    setResult(null)
    setErrorMessage(null)
    setDetailErrorMessage(null)
    setIsSubmitting(true)

    try {
      const journeyResult = await createJourney(patient.id, cleanNoteText)
      let displayedResult = journeyResult
      try {
        const details = await getJourney(journeyResult.journey.id)
        displayedResult = {
          journey: details.journey,
          actions: includeJourneyDependencies(
            details.actions,
            details.dependencies,
          ),
        }
      } catch (detailError) {
        setDetailErrorMessage(getRefreshErrorMessage(detailError))
      }
      setResult(displayedResult)
    } catch (error) {
      setErrorMessage(getSubmissionErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function updatePatient(value: Patient | null) {
    setPatient(value)
    setValidationMessage(null)
  }

  function updateNote(value: string) {
    setNoteText(value)
    setValidationMessage(null)
  }

  return (
    <div className="page-stack doctor-console">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLINICAL WORKSPACE</div>
          <h1>Doctor Console</h1>
          <p>Convert clinical notes into trackable care actions.</p>
        </div>
        <div className="page-heading__icon" aria-hidden="true">
          <ClipboardList size={23} />
        </div>
      </div>

      <Card
        className="doctor-workspace"
        title="New care plan"
        description="Select a patient and enter a clinical note to create a care journey."
      >
        <form className="doctor-form" onSubmit={handleSubmit}>
          <PatientPicker
            value={patient}
            disabled={isSubmitting}
            onChange={updatePatient}
          />

          <DoctorNoteEditor
            value={noteText}
            disabled={isSubmitting}
            onChange={updateNote}
            onLoadDemo={() => updateNote(DEMO_NOTE)}
            onClear={() => {
              updateNote('')
              voiceInput.clearState()
            }}
            isListening={voiceInput.isListening}
            interimTranscript={voiceInput.interimTranscript}
            voiceError={voiceInput.error}
            voiceSupported={voiceInput.isSupported}
            onStartRecording={voiceInput.start}
            onStopRecording={voiceInput.stop}
            onClearVoiceState={voiceInput.clearState}
          />

          {validationMessage && (
            <div className="inline-validation" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              {validationMessage}
            </div>
          )}

          {errorMessage && (
            <ErrorState
              title="Extraction failed"
              description={errorMessage}
            />
          )}

          {isSubmitting && (
            <div className="submission-progress" role="status" aria-live="polite">
              <LoaderCircle size={17} className="submission-progress__spinner" />
              <span>Extracting care actions...</span>
            </div>
          )}

          <div className="doctor-form__submit-row">
            <span className="doctor-form__privacy">
              The note is sent to the configured backend for extraction.
            </span>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !patient || voiceInput.isListening}
            >
              <Sparkles size={16} aria-hidden="true" />
              {isSubmitting ? 'Extracting...' : 'Extract Care Actions'}
            </Button>
          </div>
        </form>
      </Card>

      {result ? (
        <div className="page-stack doctor-results" aria-live="polite">
          <div className="success-banner" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <div>
              <strong>Journey created and extraction completed</strong>
              <span>
                Journey and action details reflect the latest backend response.
              </span>
            </div>
          </div>

          <AnomalyReviewPanel
            actions={anomalyActions}
            onReview={handleAnomalyReview}
          />

          <Card
            title="Journey information"
            description="Journey information returned by the backend."
          >
            <dl className="journey-summary">
              <div>
                <dt>Journey ID</dt>
                <dd>{result.journey.id}</dd>
              </div>
              <div>
                <dt>Patient ID</dt>
                <dd>{result.journey.patient_id}</dd>
              </div>
              {patient?.id === result.journey.patient_id && (
                <div>
                  <dt>Patient</dt>
                  <dd>{patient.name}</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge>{result.journey.status}</Badge>
                </dd>
              </div>
              {result.journey.created_at && (
                <div>
                  <dt>Created</dt>
                  <dd>
                    <time dateTime={result.journey.created_at}>
                      {result.journey.created_at}
                    </time>
                  </dd>
                </div>
              )}
              {result.journey.updated_at && (
                <div>
                  <dt>Updated</dt>
                  <dd>
                    <time dateTime={result.journey.updated_at}>
                      {result.journey.updated_at}
                    </time>
                  </dd>
                </div>
              )}
              <div className="journey-summary__note">
                <dt>Note</dt>
                <dd>{result.journey.note_text}</dd>
              </div>
            </dl>
          </Card>

          {refreshNotice && (
            <div className="graph-refresh-notice" role="status">
              {refreshNotice}
            </div>
          )}

          <Card
            title="Extracted care actions"
            description="Action details are displayed from the verified response fields."
          >
            {result.actions.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={20} />}
                title="No care actions were extracted from this note."
                description="The backend returned an empty actions list."
              />
            ) : (
              <div className="care-action-list">
                {otherActions.length > 0 ? (
                  otherActions.map((action) => (
                    <CareActionCard key={action.id} action={action} />
                  ))
                ) : heldActions.length > 0 ? null : (
                  <EmptyState
                    icon={<ClipboardList size={20} />}
                    title="No care actions yet"
                    description="Actions will appear after extraction."
                  />
                )}
              </div>
            )}
          </Card>

          {heldActions.length > 0 && (
            <HeldActionsPanel actions={heldActions} />
          )}

          <Card
            title="Dependency graph"
            description="Visual representation of dependencies returned with this journey."
          >
            <DependencyGraph actions={result.actions} />
          </Card>

          <CaregiverContactStatus patient={patient} />
        </div>
      ) : (
        <Card
          title="Extracted care actions"
          description="Actions will appear here after a successful extraction."
        >
          <EmptyState
            icon={<ClipboardList size={20} />}
            title="No care actions yet"
            description="Submit a clinical note to create a journey and display its returned actions."
          />
        </Card>
      )}
    </div>
  )
}
