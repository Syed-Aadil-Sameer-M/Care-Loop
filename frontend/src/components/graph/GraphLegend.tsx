import { Badge } from '../common/Badge'
import { getStatusBadgeTone } from '../../utils/actionState'

export function GraphLegend({ states }: { states: string[] }) {
  return (
    <div className="graph-legend" aria-label="States shown in this graph">
      <span className="graph-legend__label">States in this journey</span>
      <div className="graph-legend__items">
        {states.map((state) => (
          <Badge key={state} tone={getStatusBadgeTone(state)}>
            {state.replaceAll('_', ' ')}
          </Badge>
        ))}
      </div>
    </div>
  )
}
