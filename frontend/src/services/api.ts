import type {
  CareAction,
  CreateJourneyResponse,
  JourneyDetailResponse,
  Journey,
  Patient,
  CoordinatorJourney,
  DepartmentCompletionResponse,
  DemoControlResponse,
} from '../types'

const DEFAULT_API_BASE_URL = 'http://localhost:3001'
const REQUEST_TIMEOUT_MS = 10_000

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(
    message: string,
    status: number,
    body: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export class InvalidApiResponseError extends Error {
  constructor() {
    super('The backend returned an invalid journey response.')
    this.name = 'InvalidApiResponseError'
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    if (!response.ok) {
      throw new ApiError(
        `Request failed with status ${response.status}`,
        response.status,
        text,
      )
    }

    throw new ApiError('The server returned invalid JSON', response.status, text)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOptionalNullableString(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return !(key in value) || value[key] === null || typeof value[key] === 'string'
}

function isOptionalNullableNumber(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return (
    !(key in value) ||
    value[key] === null ||
    (typeof value[key] === 'number' && Number.isFinite(value[key]))
  )
}

function isJourney(value: unknown): value is Journey {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.patient_id === 'string' &&
    typeof value.note_text === 'string' &&
    typeof value.status === 'string' &&
    isOptionalNullableString(value, 'created_at') &&
    isOptionalNullableString(value, 'updated_at')
  )
}

function parseCoordinatorJourney(value: unknown): CoordinatorJourney {
  if (!isRecord(value) || !isJourney(value)) {
    throw new InvalidApiResponseError()
  }

  const patient = value.patients
  if (
    patient !== undefined &&
    patient !== null &&
    (!isRecord(patient) ||
      !isOptionalNullableString(patient, 'name') ||
      !isOptionalNullableNumber(patient, 'age'))
  ) {
    throw new InvalidApiResponseError()
  }

  return {
    id: value.id,
    patient_id: value.patient_id,
    note_text: value.note_text,
    status: value.status,
    ...(typeof value.created_at === 'string' || value.created_at === null
      ? { created_at: value.created_at }
      : {}),
    ...(typeof value.updated_at === 'string' || value.updated_at === null
      ? { updated_at: value.updated_at }
      : {}),
    ...(patient === undefined
      ? {}
      : {
          patients:
            patient === null
              ? null
              : {
                  ...(typeof patient.name === 'string' || patient.name === null
                    ? { name: patient.name }
                    : {}),
                  ...(typeof patient.age === 'number' || patient.age === null
                    ? { age: patient.age }
                    : {}),
                },
        }),
  }
}

function isCareAction(value: unknown): value is CareAction {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.journey_id === 'string' &&
    typeof value.state === 'string' &&
    isOptionalNullableString(value, 'type') &&
    isOptionalNullableString(value, 'description') &&
    isOptionalNullableString(value, 'category') &&
    (!('confidence' in value) ||
      value.confidence === null ||
      (typeof value.confidence === 'number' &&
        Number.isFinite(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 1)) &&
    isOptionalNullableString(value, 'department') &&
    isOptionalNullableString(value, 'deadline_at') &&
    isOptionalNullableNumber(value, 'retry_count') &&
    isOptionalNullableString(value, 'scheduled_slot') &&
    isOptionalNullableString(value, 'result_text') &&
    isOptionalNullableNumber(value, 'drop_risk') &&
    isOptionalNullableString(value, 'created_at') &&
    isOptionalNullableString(value, 'updated_at') &&
    (!('meta' in value) ||
      value.meta === null ||
      (isRecord(value.meta) && !Array.isArray(value.meta))) &&
    (!('depends_on' in value) ||
      (Array.isArray(value.depends_on) &&
        value.depends_on.every((dependency) => typeof dependency === 'string')))
  )
}

function isPatient(value: unknown): value is Patient {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isOptionalNullableNumber(value, 'age') &&
    isOptionalNullableString(value, 'sex') &&
    isOptionalNullableString(value, 'phone') &&
    isOptionalNullableString(value, 'email') &&
    isOptionalNullableString(value, 'caregiver_phone') &&
    isOptionalNullableString(value, 'caregiver_email') &&
    isOptionalNullableString(value, 'created_at')
  )
}

function parseCreateJourneyResponse(value: unknown): CreateJourneyResponse {
  if (!isRecord(value)) {
    throw new InvalidApiResponseError()
  }

  const journey = value.journey
  const rawActions = value.actions
  if (!isJourney(journey) || !Array.isArray(rawActions)) {
    throw new InvalidApiResponseError()
  }

  const actions: CareAction[] = []
  for (const action of rawActions) {
    if (!isCareAction(action)) throw new InvalidApiResponseError()
    actions.push(action)
  }

  return { journey, actions }
}

function isPersistedCareAction(
  value: unknown,
): value is CareAction {
  return isCareAction(value) && !('depends_on' in value)
}

function parseJourneyDetailResponse(value: unknown): JourneyDetailResponse {
  if (!isRecord(value) || !isJourney(value.journey)) {
    throw new InvalidApiResponseError()
  }
  if (!Array.isArray(value.actions) || !Array.isArray(value.dependencies)) {
    throw new InvalidApiResponseError()
  }

  const actions: CareAction[] = []
  for (const action of value.actions) {
    if (!isPersistedCareAction(action)) throw new InvalidApiResponseError()
    actions.push(action)
  }

  const dependencies: JourneyDetailResponse['dependencies'] = []
  for (const dependency of value.dependencies) {
    if (
      !isRecord(dependency) ||
      typeof dependency.action_id !== 'string' ||
      typeof dependency.depends_on_action_id !== 'string'
    ) {
      throw new InvalidApiResponseError()
    }
    dependencies.push({
      action_id: dependency.action_id,
      depends_on_action_id: dependency.depends_on_action_id,
    })
  }

  return {
    journey: value.journey,
    actions,
    dependencies,
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  )
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal

  try {
    const response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, {
      ...init,
      headers,
      signal,
    })
    const body = await readResponseBody(response)

    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : `Request failed with status ${response.status}`

      throw new ApiError(message, response.status, body)
    }

    return body as T
  } catch (error) {
    if (error instanceof ApiError) throw error

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The backend request timed out or was cancelled.')
    }

    if (error instanceof TypeError) {
      throw new Error('Backend not connected. Check the API URL and server.')
    }

    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function createJourney(
  patientId: string,
  noteText: string,
): Promise<CreateJourneyResponse> {
  const response = await apiRequest<unknown>('/api/journeys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patient_id: patientId,
      note_text: noteText,
    }),
  })

  return parseCreateJourneyResponse(response)
}

export async function getJourney(
  journeyId: string,
  signal?: AbortSignal,
): Promise<JourneyDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/journeys/${encodeURIComponent(journeyId)}`,
    { signal },
  )
  return parseJourneyDetailResponse(response)
}

export async function getPatients(signal?: AbortSignal): Promise<Patient[]> {
  const response = await apiRequest<unknown>('/api/patients', { signal })
  const rawPatients =
    Array.isArray(response)
      ? response
      : isRecord(response) && Array.isArray(response.patients)
        ? response.patients
        : null

  if (!rawPatients) throw new InvalidApiResponseError()

  const patients: Patient[] = []
  for (const patient of rawPatients) {
    if (!isPatient(patient)) throw new InvalidApiResponseError()
    patients.push(patient)
  }
  return patients
}

export async function getJourneys(
  signal?: AbortSignal,
): Promise<CoordinatorJourney[]> {
  const response = await apiRequest<unknown>('/api/journeys', { signal })
  if (!Array.isArray(response)) throw new InvalidApiResponseError()
  return response.map(parseCoordinatorJourney)
}

export async function completeDepartmentAction(
  actionId: string,
  resultText: string,
): Promise<DepartmentCompletionResponse> {
  const response = await apiRequest<unknown>(
    `/api/mock/complete/${encodeURIComponent(actionId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result_text: resultText }),
    },
  )

  if (
    !isRecord(response) ||
    response.success !== true ||
    typeof response.action_id !== 'string' ||
    typeof response.state !== 'string' ||
    typeof response.result_text !== 'string' ||
    (response.anomaly_check_triggered !== undefined &&
      typeof response.anomaly_check_triggered !== 'boolean') ||
    (response.already_completed !== undefined &&
      typeof response.already_completed !== 'boolean')
  ) {
    throw new InvalidApiResponseError()
  }
  return {
    success: true,
    ...(response.already_completed === true ? { already_completed: true } : {}),
    action_id: response.action_id,
    state: response.state,
    result_text: response.result_text,
    ...(typeof response.anomaly_check_triggered === 'boolean'
      ? { anomaly_check_triggered: response.anomaly_check_triggered }
      : {}),
  }
}

function parseDemoControl(value: unknown): DemoControlResponse {
  if (
    !isRecord(value) ||
    value.success !== true ||
    typeof value.message !== 'string'
  ) {
    throw new InvalidApiResponseError()
  }
  return { success: true, message: value.message }
}

export async function activateDemoFailure(): Promise<DemoControlResponse> {
  const response = await apiRequest<unknown>('/api/mock/force-failure', {
    method: 'POST',
  })
  return parseDemoControl(response)
}

export async function resetDemoFailure(): Promise<DemoControlResponse> {
  const response = await apiRequest<unknown>('/api/mock/reset-demo', {
    method: 'POST',
  })
  return parseDemoControl(response)
}
