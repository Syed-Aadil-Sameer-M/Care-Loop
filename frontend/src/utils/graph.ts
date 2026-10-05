import type { Edge, Node } from '@xyflow/react'
import type { CareAction } from '../types'

export interface CareActionNodeData extends Record<string, unknown> {
  action: CareAction
}

export type CareActionFlowNode = Node<CareActionNodeData, 'careAction'>

export interface DependencyGraphData {
  nodes: CareActionFlowNode[]
  edges: Edge[]
  unresolvedDependencies: number
}

export class InvalidGraphDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidGraphDataError'
  }
}

interface DependencyLink {
  source: string
  target: string
}

export function createDependencyGraphData(
  actions: CareAction[],
): DependencyGraphData {
  const actionsById = new Map<string, CareAction>()
  const actionIdsByDescription = new Map<string, string[]>()

  for (const action of actions) {
    if (!action.id.trim() || actionsById.has(action.id)) {
      throw new InvalidGraphDataError(
        'Action data contains a missing or duplicate action ID.',
      )
    }
    actionsById.set(action.id, action)
    if (action.description) {
      const ids = actionIdsByDescription.get(action.description) ?? []
      ids.push(action.id)
      actionIdsByDescription.set(action.description, ids)
    }
  }

  const links: DependencyLink[] = []
  let unresolvedDependencies = 0

  for (const action of actions) {
    if (!Array.isArray(action.depends_on)) continue

    for (const dependencyDescription of action.depends_on) {
      const dependencyIds = actionIdsByDescription.get(dependencyDescription)
      if (!dependencyIds || dependencyIds.length !== 1) {
        unresolvedDependencies += 1
        continue
      }

      if (
        !links.some(
          (link) => link.source === dependencyIds[0] && link.target === action.id,
        )
      ) {
        links.push({
          source: dependencyIds[0],
          target: action.id,
        })
      }
    }
  }

  const indegree = new Map(actions.map((action) => [action.id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const link of links) {
    indegree.set(link.target, (indegree.get(link.target) ?? 0) + 1)
    outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link.target])
  }

  const queue = actions
    .filter((action) => indegree.get(action.id) === 0)
    .map((action) => action.id)
  const layers = new Map(actions.map((action) => [action.id, 0]))
  const topologicalOrder: string[] = []

  while (queue.length > 0) {
    const source = queue.shift()
    if (!source) continue
    topologicalOrder.push(source)

    for (const target of outgoing.get(source) ?? []) {
      layers.set(
        target,
        Math.max(layers.get(target) ?? 0, (layers.get(source) ?? 0) + 1),
      )
      const nextIndegree = (indegree.get(target) ?? 0) - 1
      indegree.set(target, nextIndegree)
      if (nextIndegree === 0) queue.push(target)
    }
  }

  const drawableIds = new Set(topologicalOrder)
  if (drawableIds.size !== actions.length) {
    unresolvedDependencies += links.filter(
      (link) => !drawableIds.has(link.source) || !drawableIds.has(link.target),
    ).length
  }

  const columns = new Map<number, string[]>()
  for (const action of actions) {
    const layer = drawableIds.has(action.id) ? (layers.get(action.id) ?? 0) : 0
    columns.set(layer, [...(columns.get(layer) ?? []), action.id])
  }

  const nodes: CareActionFlowNode[] = []
  const orderedLayers = [...columns.keys()].sort((left, right) => left - right)

  for (const layer of orderedLayers) {
    const ids = columns.get(layer) ?? []
    ids.forEach((id, row) => {
      const action = actionsById.get(id)
      if (!action) return
      nodes.push({
        id: action.id,
        type: 'careAction',
        position: {
          x: layer * 310,
          y: row * 168,
        },
        data: { action },
      })
    })
  }

  const edges: Edge[] = links
    .filter((link) => drawableIds.has(link.source) && drawableIds.has(link.target))
    .map((link) => ({
      id: `${link.source}->${link.target}`,
      source: link.source,
      target: link.target,
      type: 'smoothstep',
      animated: false,
      label: 'depends on',
      labelStyle: { fill: '#71858a', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#f5f7f8', fillOpacity: 0.95 },
      markerEnd: {
        type: 'arrowclosed',
        color: '#86a29f',
        width: 16,
        height: 16,
      },
      style: { stroke: '#86a29f', strokeWidth: 1.7 },
    }))

  return { nodes, edges, unresolvedDependencies }
}
