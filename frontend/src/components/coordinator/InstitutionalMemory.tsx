import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card } from '../common/Card'

const journeyData = Array.from({ length: 50 }, (_, index) => {
  const journey = index + 1

  // Demo data: drop rate decreases from 38% to 6%
  const dropRate = 38 - ((38 - 6) * index) / 49

  return {
    journey,
    dropRate: Number(dropRate.toFixed(1)),
  }
})

const actionData = [
  {
    action: 'Referral',
    before: '38%',
    careLoop: '6%',
    improvement: '32%',
  },
  {
    action: 'Follow-up',
    before: '24%',
    careLoop: '8%',
    improvement: '16%',
  },
  {
    action: 'Lab completion',
    before: '19%',
    careLoop: '5%',
    improvement: '14%',
  },
]

export function InstitutionalMemory() {
  return (
    <Card
      title="Institutional Memory"
      description="Mock Phase 2 learning view based on 50 care journeys."
    >
      <div className="institutional-memory">
        <div className="institutional-memory__header">
          <div>
            <strong>Clinic drop-rate trend</strong>
            <p>
              CareLoop learns from previous journeys and adapts future routing.
            </p>
          </div>

          <span className="institutional-memory__badge">
            PHASE 2
          </span>
        </div>

        <div
          className="institutional-memory__chart"
          style={{ width: '100%', height: 300 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={journeyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="journey"
                label={{
                  value: 'Journey number',
                  position: 'insideBottom',
                  offset: -5,
                }}
              />
              <YAxis
                label={{
                  value: 'Drop rate %',
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip
                formatter={(value) => [`${value}%`, 'Drop rate']}
                labelFormatter={(label) => `Journey ${label}`}
              />
              <Line
                type="monotone"
                dataKey="dropRate"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="institutional-memory__insight">
          Referral drop rate on Fridays: 38% → CareLoop now auto-routes to
          Monday.
        </p>

        <div className="institutional-memory__table-wrapper">
          <table className="institutional-memory__table">
            <thead>
              <tr>
                <th>Action type</th>
                <th>Pre-CareLoop rate</th>
                <th>CareLoop rate</th>
                <th>Improvement</th>
              </tr>
            </thead>
            <tbody>
              {actionData.map((item) => (
                <tr key={item.action}>
                  <td>{item.action}</td>
                  <td>{item.before}</td>
                  <td>{item.careLoop}</td>
                  <td>{item.improvement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="institutional-memory__phase">
          <strong>This is Phase 2</strong>
          <p>
            After 50 live journeys the system learns which actions fail at
            this specific clinic and adapts routing automatically.
          </p>
        </div>

        <div className="institutional-memory__demo-line">
          Most AI tools solve the individual case. CareLoop learns from every
          case to prevent the next one — at the institutional level.
        </div>
      </div>
    </Card>
  )
}
