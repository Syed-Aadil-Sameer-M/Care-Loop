export type CareActionState =
  | 'CREATED'
  | 'VALIDATED'
  | 'HELD'
  | 'REJECTED'
  | 'ASSIGNED'
  | 'BLOCKED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VERIFIED'
  | 'OVERDUE'
  | 'ESCALATED'
  | 'CANCELLED'

export type CareActionType =
  | 'TEST'
  | 'REFERRAL'
  | 'MEDICATION'
  | 'FOLLOWUP'
  | 'REVIEW'

export type CareActionCategory = 'Explicit' | 'Inferred' | 'Conditional'

export interface Patient {
  id: string
  name: string
  age?: number | null
  sex?: string | null
  phone?: string | null
  email?: string | null
  caregiver_phone?: string | null
  caregiver_email?: string | null
  created_at?: string | null
}

export interface CareAction {
  id: string
  journey_id: string
  type?: CareActionType | string | null
  description?: string | null
  category?: CareActionCategory | string | null
  confidence?: number | null
  department?: string | null
  deadline_at?: string | null
  state: string
  retry_count?: number | null
  scheduled_slot?: string | null
  result_text?: string | null
  drop_risk?: number | null
  meta?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  depends_on?: string[]
}

export interface Journey {
  id: string
  patient_id: string
  note_text: string
  status: string
  created_at?: string | null
  updated_at?: string | null
}

export interface CreateJourneyResponse {
  journey: Journey
  actions: CareAction[]
}

export interface JourneyDetailResponse {
  journey: Journey
  actions: CareAction[]
  dependencies: ActionDependency[]
}

export interface CoordinatorJourney extends Journey {
  patients?: {
    name?: string | null
    age?: number | null
  } | null
}

export interface ActionDependency {
  action_id: string
  depends_on_action_id: string
}

export interface DepartmentCompletionResponse {
  success: boolean
  already_completed?: boolean
  action_id: string
  state: string
  result_text: string
  anomaly_check_triggered?: boolean
}

export interface DemoControlResponse {
  success: boolean
  message: string
}
