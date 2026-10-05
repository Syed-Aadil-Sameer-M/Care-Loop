import type {
  ChatMessage,
  DemoIntent,
  PatientMessageService,
} from '../types/patientSimulator'

const quickReplies: Record<
  DemoIntent,
  { patientText: string; simulatorText: string }
> = {
  CONFIRM: {
    patientText: 'I confirm my appointment.',
    simulatorText: 'Demo: Patient confirmation received.',
  },
  RESCHEDULE: {
    patientText: 'I need to reschedule my appointment.',
    simulatorText: 'Demo: Reschedule request received.',
  },
  URGENT: {
    patientText: 'This is urgent. I need help immediately.',
    simulatorText: 'Demo: Urgent request received.',
  },
}

let messageSequence = 0

function createId(): string {
  messageSequence += 1
  return `local-demo-${messageSequence}`
}

function getInitialConversation(): ChatMessage[] {
  return [
    {
      id: 'initial-demo-patient',
      sender: 'patient',
      text: 'Hello, I want to check my appointment.',
      kind: 'initial-demo',
      intent: 'NOT_CLASSIFIED',
    },
    {
      id: 'initial-demo-simulator',
      sender: 'simulator',
      text: 'Demo mode: choose a patient reply action below.',
      kind: 'initial-demo',
    },
  ]
}

function createIntentExchange(intent: DemoIntent): ChatMessage[] {
  const reply = quickReplies[intent]
  return [
    {
      id: createId(),
      sender: 'patient',
      text: reply.patientText,
      kind: 'demo-patient',
      intent,
    },
    {
      id: createId(),
      sender: 'simulator',
      text: reply.simulatorText,
      kind: 'demo-reply',
    },
  ]
}

function createCustomMessage(text: string): ChatMessage {
  return {
    id: createId(),
    sender: 'patient',
    text,
    kind: 'typed-patient',
    intent: 'NOT_CLASSIFIED',
  }
}

export const localDemoMessaging: PatientMessageService = {
  getInitialConversation,
  createIntentExchange,
  createCustomMessage,
}
