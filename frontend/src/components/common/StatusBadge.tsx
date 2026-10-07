import { Badge } from './Badge'
import { getStatusBadgeTone } from '../../utils/actionState'

export function StatusBadge({ state }: { state: string }) {
  return (
    <Badge tone={getStatusBadgeTone(state)}>
      {state.replaceAll('_', ' ')}
    </Badge>
  )
}
