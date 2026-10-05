import { AlertCircle, ChevronDown, LoaderCircle, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { ApiError, getPatients } from '../../services/api'
import type { Patient } from '../../types'

interface PatientPickerProps {
  value: Patient | null
  disabled: boolean
  onChange: (patient: Patient | null) => void
}

export function PatientPicker({
  value,
  disabled,
  onChange,
}: PatientPickerProps) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPatients() {
      try {
        const response = await getPatients(controller.signal)
        if (!controller.signal.aborted) setPatients(response)
      } catch (error) {
        if (controller.signal.aborted) return
        setErrorMessage(
          error instanceof ApiError && error.status === 404
            ? 'Patient directory is not available yet.'
            : error instanceof Error &&
                error.message ===
                  'Backend not connected. Check the API URL and server.'
              ? 'Backend is unavailable. Patient records could not be loaded.'
              : 'Unable to load patient records. Please try again.',
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadPatients()
    return () => controller.abort()
  }, [])

  const filteredPatients = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return patients
    return patients.filter(
      (patient) =>
        patient.name.toLocaleLowerCase().includes(search) ||
        patient.id.toLocaleLowerCase().includes(search),
    )
  }, [patients, query])

  function selectPatient(patient: Patient) {
    onChange(patient)
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(0, filteredPatients.length - 1)),
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && isOpen && filteredPatients[activeIndex]) {
      event.preventDefault()
      selectPatient(filteredPatients[activeIndex])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="form-placeholder patient-picker">
      <label htmlFor="patient-picker-input">Patient</label>
      {value && (
        <div className="patient-picker__selected" aria-live="polite">
          <span>{value.name}</span>
          <span className="patient-picker__selected-id">{value.id}</span>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="Clear selected patient"
          >
            Change
          </button>
        </div>
      )}
      <div className="patient-id-control">
        {isLoading ? (
          <LoaderCircle
            className="patient-picker__spinner"
            size={17}
            aria-hidden="true"
          />
        ) : (
          <UserRound size={17} aria-hidden="true" />
        )}
        <input
          id="patient-picker-input"
          type="search"
          autoComplete="off"
          placeholder={isLoading ? 'Loading patients...' : 'Search patients'}
          aria-label="Search patients by name or ID"
          aria-describedby="patient-picker-help"
          aria-autocomplete="list"
          aria-controls="patient-picker-options"
          aria-activedescendant={
            isOpen && filteredPatients[activeIndex]
              ? `patient-option-${activeIndex}`
              : undefined
          }
          aria-expanded={isOpen && !value}
          role="combobox"
          value={query}
          disabled={disabled || isLoading || Boolean(errorMessage)}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown size={15} aria-hidden="true" />
      </div>
      {isOpen && !value && !isLoading && !errorMessage && (
        <ul
          className="patient-picker__options"
          id="patient-picker-options"
          role="listbox"
          aria-label="Patients"
        >
          {filteredPatients.length === 0 ? (
            <li className="patient-picker__empty" role="status">
              {patients.length === 0
                ? 'No patients are available.'
                : 'No matching patients.'}
            </li>
          ) : (
            filteredPatients.map((patient, index) => (
              <li
                key={patient.id}
                id={`patient-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex ? 'patient-picker__option--active' : ''
                }
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPatient(patient)}
              >
                <span>{patient.name}</span>
                <span>{patient.id}</span>
              </li>
            ))
          )}
        </ul>
      )}
      <div className="patient-id-hint" id="patient-picker-help">
        Search the available patient directory by name or patient ID.
      </div>
      {errorMessage && (
        <div className="patient-picker__error" role="status">
          <AlertCircle size={14} aria-hidden="true" />
          {errorMessage}
        </div>
      )}
    </div>
  )
}
