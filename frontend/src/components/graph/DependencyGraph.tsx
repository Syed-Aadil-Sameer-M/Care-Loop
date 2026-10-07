import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState } from '../common/ErrorState'
import { EmptyState } from '../common/EmptyState'
import type { CareAction } from '../../types'
import {
  createDependencyGraphData,
  InvalidGraphDataError,
  type CareActionFlowNode,
} from '../../utils/graph'
import { CareActionNode } from './CareActionNode'
import { GraphLegend } from './GraphLegend'

const nodeTypes = { careAction: CareActionNode }
const unlockDurationMs = 2200

function getGraphError(error: unknown): string {
  if (error instanceof InvalidGraphDataError) return error.message
  return 'The dependency graph could not be displayed because its data is invalid.'
}

export function DependencyGraph({ actions }: { actions: CareAction[] }) {
  const [unlockedNodeIds, setUnlockedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const previousStates = useRef<Map<string, string> | null>(null)
  const unlockTimer = useRef<number | null>(null)

  const graphResult = useMemo(() => {
    try {
      return {
        data: createDependencyGraphData(actions),
        error: null,
      }
    } catch (error) {
      return { data: null, error: getGraphError(error) }
    }
  }, [actions])

  useEffect(() => {
    const currentStates = new Map(actions.map((action) => [action.id, action.state]))
    if (!previousStates.current) {
      previousStates.current = currentStates
      return
    }

    const changedToUnblocked = actions
      .filter(
        (action) =>
          previousStates.current?.get(action.id) === 'BLOCKED' &&
          action.state !== 'BLOCKED',
      )
      .map((action) => action.id)

    previousStates.current = currentStates
    if (changedToUnblocked.length === 0) return

    setUnlockedNodeIds(new Set(changedToUnblocked))
    if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current)
    unlockTimer.current = window.setTimeout(() => {
      setUnlockedNodeIds(new Set())
      unlockTimer.current = null
    }, unlockDurationMs)
  }, [actions])

  useEffect(
    () => () => {
      if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current)
    },
    [],
  )

  const graphNodes = useMemo<CareActionFlowNode[]>(
    () =>
      (graphResult.data?.nodes ?? []).map((node) => ({
        ...node,
        className: unlockedNodeIds.has(node.id)
          ? 'care-flow-node-wrapper--unlocked'
          : undefined,
      })),
    [graphResult.data, unlockedNodeIds],
  )

  const graphEdges = useMemo<Edge[]>(
    () =>
      (graphResult.data?.edges ?? []).map((edge) => ({
        ...edge,
        animated: unlockedNodeIds.has(edge.target),
        className: unlockedNodeIds.has(edge.target)
          ? 'care-flow-edge--unlocked'
          : undefined,
      })),
    [graphResult.data, unlockedNodeIds],
  )

  const graphStates = useMemo(
    () => [...new Set(actions.map((action) => action.state))],
    [actions],
  )

  if (graphResult.error) {
    return (
      <section className="dependency-graph">
        <ErrorState title="Graph data unavailable" description={graphResult.error} />
      </section>
    )
  }

  if (actions.length === 0) {
    return (
      <section className="dependency-graph">
        <EmptyState
          title="No care actions to visualize."
          description="The dependency graph will appear when the journey returns care actions."
        />
      </section>
    )
  }

  return (
    <section className="dependency-graph" aria-label="Care action dependency graph">
      <GraphLegend states={graphStates} />
      <div className="dependency-graph__canvas">
        <ReactFlow<CareActionFlowNode, Edge>
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.22, minZoom: 0.35, maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnScroll
          aria-label="Care action dependency graph. Use mouse or touch to pan and zoom."
        >
          <Background color="#dfe8e7" gap={22} size={1} />
          <Controls
            position="bottom-right"
            showInteractive={false}
            aria-label="Graph zoom and fit controls"
          />
        </ReactFlow>
      </div>
      {graphResult.data && graphResult.data.edges.length === 0 && (
        <p className="dependency-graph__info" role="status">
          Dependency data is not available for this journey.
        </p>
      )}
      {graphResult.data && graphResult.data.unresolvedDependencies > 0 && (
        <p className="dependency-graph__warning" role="status">
          Some dependency references could not be matched to a unique action;
          unmatched links are not shown.
        </p>
      )}
    </section>
  )
}
