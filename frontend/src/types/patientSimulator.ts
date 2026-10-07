export type ChatSender = 'patient' | 'simulator'

export type DemoIntent = 'CONFIRM' | 'RESCHEDULE' | 'URGENT'

export type MessageIntent = DemoIntent | 'NOT_CLASSIFIED'

export type ChatMessageKind =
  | 'initial-demo'
  | 'demo-patient'
  | 'demo-reply'
  | 'typed-patient'

export interface ChatMessage {
  id: string
  sender: ChatSender
  text: string
  kind: ChatMessageKind
  intent?: MessageIntent
}

export interface PatientMessageService {
  getInitialConversation(): ChatMessage[]
  createIntentExchange(intent: DemoIntent): ChatMessage[]
  createCustomMessage(text: string): ChatMessage
}
