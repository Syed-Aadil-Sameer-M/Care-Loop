import type { JourneyDetailResponse, CareAction } from '../types'

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
