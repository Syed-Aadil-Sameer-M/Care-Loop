import type {
  AnomalySeverity,
  JourneyDetailResponse,
  CareAction,
} from '../types'

export interface AnomalyDetails {
  severity: AnomalySeverity
  finding: string
  reason: string
  suggested_action: string
  suggested_department: string
  triggered_by: string
}

function isAnomalySeverity(value: unknown): value is AnomalySeverity {
  return (
    value === 'LOW' ||
    value === 'MEDIUM' ||
    value === 'HIGH' ||
    value === 'NONE'
  )
}

export function getHeldAnomalyDetails(
  action: CareAction,
): AnomalyDetails | null {
  const meta = action.meta
  if (
    action.type !== 'REFERRAL' ||
    action.state !== 'HELD' ||
    !meta ||
    meta.anomaly !== true ||
    typeof meta.finding !== 'string' ||
    typeof meta.reason !== 'string' ||
    typeof meta.suggested_action !== 'string' ||
    typeof meta.suggested_department !== 'string' ||
    typeof meta.triggered_by !== 'string' ||
    !isAnomalySeverity(meta.severity)
  ) {
    return null
  }

  return {
    severity: meta.severity,
    finding: meta.finding,
    reason: meta.reason,
    suggested_action: meta.suggested_action,
    suggested_department: meta.suggested_department,
    triggered_by: meta.triggered_by,
  }
}

export function includeJourneyDependencies(
  actions: JourneyDetailResponse['actions'],
  dependencies: JourneyDetailResponse['dependencies'],
): CareAction[] {
  const descriptionsById = new Map(
    actions
      .filter(
        (action): action is CareAction & { description: string } =>
          typeof action.description === 'string' && action.description.length > 0,
      )
      .map((action) => [action.id, action.description]),
  )
  const dependenciesByAction = new Map<string, string[]>()

  for (const dependency of dependencies) {
    const dependencyDescription = descriptionsById.get(
      dependency.depends_on_action_id,
    )
    if (!dependencyDescription) continue
    dependenciesByAction.set(dependency.action_id, [
      ...(dependenciesByAction.get(dependency.action_id) ?? []),
      dependencyDescription,
    ])
  }

  return actions.map((action) => ({
    ...action,
    depends_on: dependenciesByAction.get(action.id) ?? [],
  }))
}
