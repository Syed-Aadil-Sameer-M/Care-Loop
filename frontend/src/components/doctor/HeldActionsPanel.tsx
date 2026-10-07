import { AlertTriangle, ShieldAlert } from 'lucide-react'
import type { CareAction } from '../../types'
import { Button } from '../common/Button'
import { CareActionCard } from './CareActionCard'

export function HeldActionsPanel({ actions }: { actions: CareAction[] }) {
  if (actions.length === 0) return null

  return (
    <section className="held-panel" aria-labelledby="held-actions-title">
      <div className="held-panel__header">
        <span className="held-panel__icon" aria-hidden="true">
          <AlertTriangle size={19} />
        </span>
        <div>
          <div className="held-panel__eyebrow">REQUIRES ATTENTION</div>
          <h2 id="held-actions-title">HELD ACTIONS</h2>
          <p>
            These actions are held because their confidence is below the
            backend&apos;s 0.85 threshold.
          </p>
        </div>
      </div>

      <div className="held-panel__list">
        {actions.map((action) => (
          <div className="held-action" key={action.id}>
            <CareActionCard action={action} held />
            <div className="held-action__footer">
              <div className="held-action__notice">
                <ShieldAlert size={15} aria-hidden="true" />
                <span>Doctor confirmation required</span>
              </div>
              <div className="held-action__controls">
                <Button type="button" variant="secondary" disabled>
                  Confirm
                </Button>
                <Button type="button" variant="ghost" disabled>
                  Reject
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="held-panel__footnote">
        Doctor confirmation API unavailable. These controls do not change
        action state.
      </p>
    </section>
  )
}
