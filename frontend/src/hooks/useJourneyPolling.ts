import { useEffect, useRef, useState } from 'react'
import { ApiError, getJourney } from '../services/api'
import type { CareAction, Journey } from '../types'
import { includeJourneyDependencies } from '../utils/journey'

const POLLING_INTERVAL_MS = 3000

export function useJourneyPolling(
  journeyId: string | null,
  onJourney: (journey: Journey, actions: CareAction[]) => void,
) {
  const [error, setError] = useState<{
    journeyId: string
    message: string
  } | null>(null)
  const onJourneyRef = useRef(onJourney)

  useEffect(() => {
    onJourneyRef.current = onJourney
  }, [onJourney])

  useEffect(() => {
    if (!journeyId) return

    let mounted = true
    let inFlight = false
    let stopped = false
    let controller: AbortController | null = null

    const poll = async () => {
      if (inFlight || stopped || !mounted) return
      inFlight = true
      controller = new AbortController()

      try {
        const response = await getJourney(journeyId, controller.signal)
        if (!mounted) return
        onJourneyRef.current(
          response.journey,
          includeJourneyDependencies(response.actions, response.dependencies),
        )
        setError(null)
      } catch (pollError) {
        if (
          mounted &&
          !(pollError instanceof DOMException && pollError.name === 'AbortError')
        ) {
          const isMissing = pollError instanceof ApiError && pollError.status === 404
          if (isMissing) stopped = true
          setError({
            journeyId,
            message: isMissing
              ? 'This journey is no longer available. Live updates have stopped.'
              : 'Live journey refresh is unavailable. Showing the last received data.',
          })
        }
      } finally {
        inFlight = false
      }
    }

    const interval = window.setInterval(() => {
      void poll()
    }, POLLING_INTERVAL_MS)

    return () => {
      mounted = false
      window.clearInterval(interval)
      controller?.abort()
    }
  }, [journeyId])

  return error?.journeyId === journeyId ? error.message : null
}
