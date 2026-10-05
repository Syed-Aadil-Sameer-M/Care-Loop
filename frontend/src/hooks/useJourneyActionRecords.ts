import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  getJourney,
  getJourneys,
  InvalidApiResponseError,
} from '../services/api'
import type {
  CareAction,
  CoordinatorJourney,
  JourneyDetailResponse,
} from '../types'

const POLLING_INTERVAL_MS = 15_000

export interface JourneyActionRecord {
  action: CareAction
  journey: CoordinatorJourney
}

export interface JourneyActionSnapshot {
  journeys: CoordinatorJourney[]
  actionRecords: JourneyActionRecord[]
  details: JourneyDetailResponse[]
  refreshedAt: Date
}

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof InvalidApiResponseError) {
    return 'The backend returned data in an unexpected format.'
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'A required journey or journey-detail endpoint is unavailable.'
    }
    if (error.status >= 500) {
      return 'The backend could not load coordinator journey data.'
    }
  }
  if (
    error instanceof Error &&
    error.message === 'Backend not connected. Check the API URL and server.'
  ) {
    return 'Backend is unavailable. Coordinator data could not be loaded.'
  }
  if (
    error instanceof Error &&
    error.message === 'The backend request timed out or was cancelled.'
  ) {
    return 'The coordinator data request timed out.'
  }
  return 'Coordinator journey data could not be loaded.'
}

export function useJourneyActionRecords() {
  const [snapshot, setSnapshot] = useState<JourneyActionSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setIsLoading(true)
    setError(null)

    try {
      const journeys = await getJourneys(controller.signal)
      const details = await Promise.all(
        journeys.map((journey) => getJourney(journey.id, controller.signal)),
      )
      if (controller.signal.aborted) return

      const journeyById = new Map(journeys.map((journey) => [journey.id, journey]))
      const actionRecords: JourneyActionRecord[] = details.flatMap((detail) => {
        const journey = journeyById.get(detail.journey.id)
        return journey
          ? detail.actions.map((action) => ({ action, journey }))
          : []
      })

      setSnapshot({
        journeys,
        actionRecords,
        details,
        refreshedAt: new Date(),
      })
    } catch (loadError) {
      if (controller.signal.aborted) return
      setError(getLoadErrorMessage(loadError))
    } finally {
      if (controllerRef.current === controller) {
        setIsLoading(false)
        inFlightRef.current = false
        controllerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refresh()
    }, 0)
    const interval = window.setInterval(() => {
      void refresh()
    }, POLLING_INTERVAL_MS)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      controllerRef.current?.abort()
      controllerRef.current = null
      inFlightRef.current = false
    }
  }, [refresh])

  return { snapshot, isLoading, error, refresh }
}
