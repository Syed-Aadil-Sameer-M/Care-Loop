import {
  Activity,
  CheckCircle2,
  Clock3,
  FlaskConical,
  LoaderCircle,
  Pill,
  RefreshCw,
  Stethoscope,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { CoordinatorDemoControls } from '../components/coordinator/CoordinatorDemoControls'
import { Badge } from '../components/common/Badge'
import { AnimatedMetric } from '../components/common/AnimatedMetric'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { ErrorState } from '../components/common/ErrorState'
import { LoadingState } from '../components/common/LoadingState'
import { DepartmentActionCard } from '../components/department/DepartmentActionCard'
import { useJourneyActionRecords } from '../hooks/useJourneyActionRecords'
import { completeDepartmentAction } from '../services/api'
import type { DepartmentCompletionResponse } from '../types'

const departments = [
  { id: 'Lab', label: 'Lab', icon: FlaskConical },
  { id: 'Cardiology', label: 'Cardiology', icon: Stethoscope },
  { id: 'Pharmacy', label: 'Pharmacy', icon: Pill },
] as const

const closedStates = new Set(['COMPLETED', 'VERIFIED', 'REJECTED', 'CANCELLED'])

function getDepartmentName(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? ''
}

export function DepartmentSimulator() {
  const [activeDepartment, setActiveDepartment] =
    useState<(typeof departments)[number]['id']>('Lab')
  const { snapshot, isLoading, error, refresh } = useJourneyActionRecords()

  const selectedDepartment = departments.find(
    (department) => department.id === activeDepartment,
  )
  const SelectedIcon = selectedDepartment?.icon ?? FlaskConical
  const actionRecords = useMemo(
    () => snapshot?.actionRecords ?? [],
    [snapshot],
  )
  const records = useMemo(
    () =>
      actionRecords.filter(
        ({ action }) =>
          getDepartmentName(action.department) ===
          getDepartmentName(activeDepartment),
      ),
    [actionRecords, activeDepartment],
  )
  const metrics = useMemo(() => {
    const available = snapshot !== null
    return [
      {
        title: 'Active',
        value: available
          ? actionRecords.filter(({ action }) => !closedStates.has(action.state))
              .length
          : 'Unavailable',
        foot: 'Non-terminal actions',
        icon: Activity,
      },
      {
        title: 'Scheduled',
        value: available
          ? actionRecords.filter(({ action }) => action.state === 'SCHEDULED')
              .length
          : 'Unavailable',
        foot: 'Backend state: SCHEDULED',
        icon: Clock3,
      },
      {
        title: 'In progress',
        value: available
          ? actionRecords.filter(({ action }) => action.state === 'IN_PROGRESS')
              .length
          : 'Unavailable',
        foot: 'Backend state: IN_PROGRESS',
        icon: Activity,
      },
      {
        title: 'Completed',
        value: available
          ? actionRecords.filter(({ action }) =>
              ['COMPLETED', 'VERIFIED'].includes(action.state),
            ).length
          : 'Unavailable',
        foot: 'COMPLETED or VERIFIED',
        icon: CheckCircle2,
      },
      {
        title: 'Failed',
        value: 'Unavailable',
        foot: 'No FAILED state or failure-list API',
        icon: Clock3,
      },
    ]
  }, [actionRecords, snapshot])

  async function submitCompletion(
    actionId: string,
    resultText: string,
  ): Promise<DepartmentCompletionResponse> {
    try {
      return await completeDepartmentAction(actionId, resultText)
    } finally {
      void refresh()
    }
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? departments.length - 1
          : (currentIndex +
              (event.key === 'ArrowRight' ? 1 : departments.length - 1)) %
            departments.length
    const nextDepartment = departments[nextIndex]
    setActiveDepartment(nextDepartment.id)
    document.getElementById(`tab-${nextDepartment.id}`)?.focus()
  }

  return (
    <div className="page-stack department-simulator-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CARE EXECUTION · DEPARTMENT OPERATIONS</div>
          <h1>Department Simulator</h1>
          <p>
            Follow backend-routed care work from assignment through department
            completion.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={isLoading}
          onClick={() => void refresh()}
        >
          {isLoading ? (
            <LoaderCircle className="button-spinner" size={15} />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          Refresh worklist
        </Button>
      </div>

      <div className="department-data-note">
        <Badge tone="blue">Live backend worklist</Badge>
        <span>
          Journeys and actions come from the implemented journey APIs. The
          shared worklist refreshes automatically every 15 seconds.
        </span>
      </div>

      {error && (
        <ErrorState
          title={snapshot ? 'Worklist refresh failed' : 'Department worklist unavailable'}
          description={
            snapshot
              ? `Showing the last successful backend response. ${error}`
              : `No worklist is shown without journey and action data. ${error}`
          }
        />
      )}

      <div className="stat-grid department-metric-grid">
        {metrics.map(({ title, value, foot, icon: Icon }) => (
          <Card key={title} className="stat-card">
            <div className="stat-card__top">
              <span className="stat-card__icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="stat-card__label">{title}</span>
            </div>
            <AnimatedMetric className="stat-card__value" value={value} />
            <div className="stat-card__foot">{foot}</div>
          </Card>
        ))}
      </div>

      <Card className="department-card">
        <div className="department-tabs" role="tablist" aria-label="Department">
          {departments.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={activeDepartment === id}
              aria-controls="department-panel"
              tabIndex={activeDepartment === id ? 0 : -1}
              className={`department-tab${activeDepartment === id ? ' department-tab--active' : ''}`}
              onClick={() => setActiveDepartment(id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
              {snapshot && (
                <span className="department-tab__count">
                  {
                    actionRecords.filter(
                      ({ action }) =>
                        getDepartmentName(action.department) ===
                        getDepartmentName(id),
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </div>
        <div
          className="department-panel"
          role="tabpanel"
          id="department-panel"
          aria-labelledby={`tab-${activeDepartment}`}
          tabIndex={0}
        >
          <div className="department-console-heading">
            <div className="department-console-heading__identity">
              <span className="department-console-heading__icon">
                <SelectedIcon size={20} aria-hidden="true" />
              </span>
              <div>
                <h2>{selectedDepartment?.label} operations</h2>
                <p>
                  {records.length} action{records.length === 1 ? '' : 's'} in
                  this department worklist
                </p>
              </div>
            </div>
            {snapshot?.refreshedAt && (
              <span className="department-last-updated">
                Updated {snapshot.refreshedAt.toLocaleTimeString()}
              </span>
            )}
          </div>

          {isLoading && !snapshot ? (
            <div className="coordinator-loading">
              <LoadingState label="Loading department actions…" />
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={<SelectedIcon size={21} />}
              title={`No ${selectedDepartment?.label ?? 'department'} actions found`}
              description={
                snapshot
                  ? 'The backend returned no actions assigned to this department.'
                  : 'Department actions are unavailable until the backend worklist can be loaded.'
              }
            />
          ) : (
            <div className="department-action-list">
              {records.map((record) => (
                <DepartmentActionCard
                  key={record.action.id}
                  record={record}
                  onComplete={submitCompletion}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Booking and department integrations"
        description="External department operations are dispatched by the backend executor, not simulated by the browser."
      >
        <div className="department-integration-list">
          <div>
            <strong>Lab booking</strong>
            <span>
              The Lab booking route exists, but the executor owns calls and
              persists the action state/slot after the response. Direct UI
              booking is disabled to avoid duplicate slot reservations.
            </span>
          </div>
          <div>
            <strong>Cardiology referral</strong>
            <span>
              Referral dispatch is executor-managed. No separate safe,
              user-triggered referral operation is exposed.
            </span>
          </div>
          <div>
            <strong>Pharmacy</strong>
            <span>
              Medication slot booking runs through the executor. The dashboard
              displays returned action and result fields only.
            </span>
          </div>
          <p>
            Backend contract unavailable — frontend remains integration-ready
            for direct department controls that need their own lifecycle
            contract.
          </p>
        </div>
      </Card>

      <CoordinatorDemoControls onActionComplete={() => void refresh()} />
    </div>
  )
}
