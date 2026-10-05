import { HeartHandshake } from 'lucide-react'
import type { Patient } from '../../types'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'

export function CaregiverContactStatus({
  patient,
}: {
  patient: Patient | null
}) {
  const contacts = [
    patient?.caregiver_phone
      ? { label: 'Caregiver phone', value: patient.caregiver_phone }
      : null,
    patient?.caregiver_email
      ? { label: 'Caregiver email', value: patient.caregiver_email }
      : null,
  ].filter((contact): contact is { label: string; value: string } => contact !== null)

  return (
    <Card
      title="Caregiver communication"
      description="Contact details are displayed only when returned with the selected patient."
    >
      {contacts.length === 0 ? (
        <EmptyState
          icon={<HeartHandshake size={20} />}
          title="Caregiver contact unavailable"
          description="No caregiver contact details are present in the available patient data. This UI does not send messages."
        />
      ) : (
        <dl className="caregiver-contact-list">
          {contacts.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <p>
            Contact availability only. Patient/caregiver messaging is not
            connected.
          </p>
        </dl>
      )}
    </Card>
  )
}
