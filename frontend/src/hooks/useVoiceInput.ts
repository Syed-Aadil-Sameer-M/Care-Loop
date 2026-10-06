import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechAlternative {
  transcript: string
}

interface SpeechResult extends ArrayLike<SpeechAlternative> {
  isFinal: boolean
}

interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}

interface SpeechErrorEvent {
  error: string
}

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface BrowserSpeechWindow extends Window {
  SpeechRecognition?: new () => BrowserSpeechRecognition
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition
}

export function useVoiceInput(onFinalTranscript: (text: string) => void) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const [isSupported, setIsSupported] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const clearState = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.stop()
    setInterimTranscript('')
    setError(null)
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    setError(null)
    setInterimTranscript('')
    const speechWindow = window as BrowserSpeechWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setIsSupported(false)
      setError('Voice input is not supported by this browser. You can type the note instead.')
      return
    }

    try {
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-IN'
      recognition.onresult = (event) => {
        let interim = ''
        let finalText = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (!result) continue
          const transcript = result[0]?.transcript ?? ''
          if (result.isFinal) {
            finalText += transcript
          } else {
            interim += transcript
          }
        }
        setInterimTranscript(interim)
        if (finalText.trim()) onFinalTranscript(finalText.trim())
      }
      recognition.onerror = (event) => {
        setError(`Voice input stopped: ${event.error}. Review the note and try again or type instead.`)
        setIsListening(false)
      }
      recognition.onend = () => {
        setIsListening(false)
        setInterimTranscript('')
      }
      recognitionRef.current?.stop()
      recognitionRef.current = recognition
      recognition.start()
      setIsSupported(true)
      setIsListening(true)
    } catch {
      setIsListening(false)
      setError('Voice input could not start. Check browser microphone permission or type the note instead.')
    }
  }, [onFinalTranscript])

  useEffect(
    () => () => {
      recognitionRef.current?.stop()
      recognitionRef.current = null
    },
    [],
  )

  return {
    start,
    stop,
    clearState,
    isSupported,
    isListening,
    interimTranscript,
    error,
  }
}
