export type StatusBadgeTone = 'neutral' | 'teal' | 'amber' | 'red' | 'blue'

const stateTones: Record<string, StatusBadgeTone> = {
  CREATED: 'neutral',
  VALIDATED: 'blue',
  HELD: 'amber',
  BLOCKED: 'amber',
  ASSIGNED: 'blue',
  SCHEDULED: 'blue',
  IN_PROGRESS: 'blue',
  COMPLETED: 'teal',
  VERIFIED: 'teal',
  OVERDUE: 'red',
  ESCALATED: 'red',
  REJECTED: 'red',
  CANCELLED: 'red',
}

export function getStatusBadgeTone(state: string): StatusBadgeTone {
  return stateTones[state] ?? 'neutral'
}
