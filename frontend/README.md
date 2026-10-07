# CareLoop Frontend

Isolated React, TypeScript, and Vite application for CareLoop's operational UI.

## Requirements

- Node.js 22 or newer
- npm

## Setup

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in `.env` to the backend origin if it differs from
`http://localhost:3001`. API requests use the shared fetch client in
`src/services/api.ts`.

## Validation

```powershell
npm run typecheck
npm run lint
npm run build
```

## Routes

- `/doctor` — Doctor Console, patient selection, journey creation, and journey
  detail polling
- `/coordinator` — journey/action-derived coordinator dashboard with honest
  unavailable states for audit, realtime activity, and predictive scoring
- `/patient` — local-only Patient WhatsApp Simulator demo; it does not call the
  backend or send messages
- `/departments` — Lab, Cardiology, and Pharmacy operational worklists with
  backend-derived workload statistics and completion integration
- `/` redirects to `/doctor`

## Doctor Console integration

The Doctor Console uses `GET /api/patients`, `POST /api/journeys`, and
`GET /api/journeys/:id`. It refreshes journey details every three seconds;
HELD confirmation controls remain disabled until a backend endpoint is
available. Browser-native speech recognition, when supported, only appends text
for doctor review and never submits automatically.

The coordinator loads `GET /api/journeys` and each journey's detail route.
Exception counts and action metrics are derived only from those returned
records. Audit read, live activity, and drop-risk scoring may be unavailable
because no corresponding implemented backend feed/calculation exists in the
checked-out source. Its reset control only clears the backend's demo failure
switch; it does not reset persisted records. Fast-forward and Judge Mode remain
disabled.

The department simulator uses `GET /api/journeys` and
`GET /api/journeys/:id` to build its worklist and polls through the shared
journey/action hook every 15 seconds. Its summary counts come only from
returned action states; the Failed count is unavailable because the backend
does not expose a `FAILED` action state or failure-list endpoint.

Department-reported results use `POST /api/mock/complete/:actionId` with
`{ "result_text": "..." }`. The UI displays completion only after the backend
confirms `success`, `action_id`, `state`, and `result_text`; the optional
`anomaly_check_triggered` field is also shown when present.

The backend implements `POST /api/mock/lab/book`,
`POST /api/mock/referral/send`, and `POST /api/mock/pharmacy/log`, each taking
`{ "action_id": "..." }`. These routes reserve slots and are called by the
backend executor, which then persists the action's scheduled state/slot.
Direct browser booking is disabled because calling a booking route independently
could reserve a duplicate slot without updating the care action. The verified
Force Failure and Reset controls are exposed; Fast-Forward and Judge Mode
remain disabled because their backend contracts are unavailable.

The Patient WhatsApp Simulator runs entirely in local component state and does
not represent demo replies as delivered messages or backend classifications.
No frontend page fabricates patient, journey, audit, anomaly, or risk results.

The patient-list integration expects an array of patient rows or an object with
a `patients` array. The patient-list route must be available in the configured
backend for selection and extraction to be enabled.
