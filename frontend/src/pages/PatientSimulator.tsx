import {
  Check,
  MessageCircle,
  RefreshCw,
  Send,
  TriangleAlert,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { DemoReply } from '../components/patient/DemoReply'
import { IntentBadge } from '../components/patient/IntentBadge'
import { localDemoMessaging } from '../services/localDemoMessaging'
import type {
  ChatMessage,
  DemoIntent,
} from '../types/patientSimulator'

const intentControls: {
  intent: DemoIntent
  icon: typeof Check
  description: string
  tone: 'confirm' | 'reschedule' | 'urgent'
}[] = [
  {
    intent: 'CONFIRM',
    icon: Check,
    description: 'Simulate an appointment confirmation',
    tone: 'confirm',
  },
  {
    intent: 'RESCHEDULE',
    icon: RefreshCw,
    description: 'Simulate a reschedule request',
    tone: 'reschedule',
  },
  {
    intent: 'URGENT',
    icon: TriangleAlert,
    description: 'Simulate an urgent patient message',
    tone: 'urgent',
  },
]

function getPatientMessageLabel(message: ChatMessage): string {
  if (message.kind === 'initial-demo') return 'Sample patient message'
  if (message.kind === 'demo-patient') return 'Simulated patient reply'
  return 'Typed patient message · local demo'
}

export function PatientSimulator() {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    localDemoMessaging.getInitialConversation(),
  )
  const [draft, setDraft] = useState('')

  function simulateReply(intent: DemoIntent) {
    setMessages((current) => [
      ...current,
      ...localDemoMessaging.createIntentExchange(intent),
    ])
  }

  function sendCustomMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setMessages((current) => [
      ...current,
      localDemoMessaging.createCustomMessage(text),
    ])
    setDraft('')
  }

  function clearConversation() {
    setMessages([])
  }

  function resetConversation() {
    setMessages(localDemoMessaging.getInitialConversation())
    setDraft('')
  }

  return (
    <div className="page-stack patient-simulator-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PATIENT COMMUNICATION</div>
          <h1>Patient WhatsApp Simulator</h1>
          <p>
            Explore example patient replies in an isolated local demo.
          </p>
        </div>
        <Badge tone="amber">
          <span className="local-demo-indicator" />
          LOCAL DEMO
        </Badge>
      </div>

      <Card
        className="patient-simulator-card"
        title="Conversation preview"
        description="This simulator changes only local page state. No message is sent or delivered."
        action={
          <div className="conversation-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={clearConversation}
              disabled={messages.length === 0}
            >
              Clear conversation
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={resetConversation}
            >
              Reset conversation
            </Button>
          </div>
        }
      >
        <section className="simulator-phone" aria-label="Local demo conversation">
          <div className="simulator-phone__speaker" aria-hidden="true" />

          <header className="simulator-contact">
            <div className="simulator-contact__avatar" aria-hidden="true">
              <MessageCircle size={18} />
            </div>
            <div className="simulator-contact__identity">
              <strong>Ramesh</strong>
              <span>RAMESH-001 · Demo patient</span>
            </div>
            <Badge tone="teal">Local Demo Simulation</Badge>
          </header>

          <div
            className="simulator-transcript"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <div className="simulator-empty">
                <div className="simulator-empty__icon" aria-hidden="true">
                  <MessageCircle size={22} />
                </div>
                <strong>No messages yet</strong>
                <p>
                  Use one of the demo reply buttons below to simulate a patient
                  response.
                </p>
              </div>
            ) : (
              <>
                <div className="simulator-day-label">
                  <span>LOCAL DEMO</span>
                </div>
                <div className="simulator-messages">
                  {messages.map((message) =>
                    message.sender === 'simulator' ? (
                      <DemoReply key={message.id} text={message.text} />
                    ) : (
                      <article
                        className="patient-message"
                        key={message.id}
                        aria-label={getPatientMessageLabel(message)}
                      >
                        <div className="patient-message__meta">
                          <span>{getPatientMessageLabel(message)}</span>
                          {message.intent && (
                            <IntentBadge intent={message.intent} />
                          )}
                        </div>
                        <p>{message.text}</p>
                        {message.intent === 'NOT_CLASSIFIED' && (
                          <span className="patient-message__classifier-note">
                            No backend classifier is connected.
                          </span>
                        )}
                      </article>
                    ),
                  )}
                </div>
              </>
            )}
          </div>

          <form
            className="simulator-compose"
            onSubmit={sendCustomMessage}
            aria-label="Add a local demo patient message"
          >
            <label className="sr-only" htmlFor="simulator-message">
              Type a message
            </label>
            <input
              id="simulator-message"
              name="message"
              type="text"
              autoComplete="off"
              placeholder="Type a message..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              className="simulator-compose__send"
              aria-label="Add message to local demo conversation"
              disabled={!draft.trim()}
            >
              <Send size={16} aria-hidden="true" />
            </Button>
          </form>

          <section
            className="simulator-controls"
            aria-labelledby="simulator-controls-title"
          >
            <div className="simulator-controls__heading">
              <h2 id="simulator-controls-title">Simulate patient reply</h2>
              <span>Local examples only</span>
            </div>
            <div className="simulator-controls__buttons">
              {intentControls.map(({ intent, icon: Icon, description, tone }) => (
                <Button
                  key={intent}
                  type="button"
                  variant="secondary"
                  className={`intent-control intent-control--${tone}`}
                  onClick={() => simulateReply(intent)}
                  aria-label={`Simulate patient reply: ${intent}`}
                  title={description}
                >
                  <Icon size={15} aria-hidden="true" />
                  {intent}
                </Button>
              ))}
            </div>
          </section>
        </section>

        <p className="simulator-disclaimer">
          Demo messages and intents are generated in this browser only. They do
          not contact a patient, Twilio, an AI classifier, or the CareLoop
          backend.
        </p>
      </Card>
    </div>
  )
}
