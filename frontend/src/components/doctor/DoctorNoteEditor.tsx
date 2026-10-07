import { Eraser, FileText, Mic, MicOff } from 'lucide-react'
import { Button } from '../common/Button'

interface DoctorNoteEditorProps {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onLoadDemo: () => void
  onClear: () => void
  isListening: boolean
  interimTranscript: string
  voiceError: string | null
  voiceSupported: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onClearVoiceState: () => void
}

export function DoctorNoteEditor({
  value,
  disabled,
  onChange,
  onLoadDemo,
  onClear,
  isListening,
  interimTranscript,
  voiceError,
  voiceSupported,
  onStartRecording,
  onStopRecording,
  onClearVoiceState,
}: DoctorNoteEditorProps) {
  return (
    <div className="form-placeholder">
      <div className="doctor-note-label-row">
        <label htmlFor="doctor-note">Clinical note</label>
        <span className="doctor-note-label-icon">
          <FileText size={15} aria-hidden="true" />
          Care instructions
        </span>
      </div>
      <textarea
        id="doctor-note"
        name="noteText"
        className="note-placeholder doctor-note-editor"
        placeholder="Enter the doctor's care instructions..."
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      <div className="voice-input-row">
        <Button
          type="button"
          variant={isListening ? 'primary' : 'secondary'}
          onClick={isListening ? onStopRecording : onStartRecording}
          disabled={disabled || !voiceSupported}
          aria-label={isListening ? 'Stop voice recording' : 'Start voice recording'}
        >
          {isListening ? (
            <MicOff size={15} aria-hidden="true" />
          ) : (
            <Mic size={15} aria-hidden="true" />
          )}
          {isListening ? 'Stop recording' : 'Voice input'}
        </Button>
        <span role={isListening || voiceError ? 'status' : undefined}>
          {isListening
            ? `Recording · review transcript before extraction${interimTranscript ? `: ${interimTranscript}` : ''}`
            : voiceError ||
              (voiceSupported
                ? 'Voice transcript is added to the note for review. Nothing is submitted automatically.'
                : 'Voice input is not supported. You can type the note instead.')}
        </span>
      </div>
      <div className="doctor-note-footer">
        <span aria-live="polite">{value.length} characters</span>
        <div className="doctor-note-actions">
          <Button type="button" variant="ghost" onClick={onClear} disabled={disabled || isListening || !value}>
            <Eraser size={14} />
            Clear note
          </Button>
          <Button type="button" variant="secondary" onClick={onLoadDemo} disabled={disabled || isListening}>
            Load Demo Note
          </Button>
        </div>
        {voiceError && (
          <button
            type="button"
            className="text-button voice-input-dismiss"
            onClick={onClearVoiceState}
            disabled={disabled}
          >
            Dismiss voice-input message
          </button>
        )}
      </div>
    </div>
  )
}
