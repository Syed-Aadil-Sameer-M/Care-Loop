<div align="center">

# 🩺 CareLoop
### Autonomous Care Execution Agent

*A clinical order is not completed care. CareLoop closes that gap.*

[![Built at](https://img.shields.io/badge/VVCE_Hackathon_2026-HLS006-0EA5E9?style=flat-square)](https://vvce.ac.in)
[![Domain](https://img.shields.io/badge/Domain-Healthcare-00C9A7?style=flat-square)](#)
[![Stack](https://img.shields.io/badge/Stack-Spring_Boot_·_FastAPI_·_React-7C3AED?style=flat-square)](#)
[![Status](https://img.shields.io/badge/Status-Live_Demo-22c55e?style=flat-square)](#)

</div>

---

## The Problem

When a doctor writes *"ECG, blood test, cardiology referral, follow-up in 7 days"* — that note gets filed.

Nobody ensures the ECG is booked. Nobody confirms the referral was sent. Nobody knows it was missed **until the patient returns weeks later in worse condition.**

> **~40% of ordered clinical tests are never completed in outpatient settings.**
> Not because of bad medicine. Because of broken coordination.

```
Doctor writes note          The void             What actually happens
──────────────────     ────────────────     ──────────────────────────
✅ ECG ordered      →                   →  ❌ ECG never booked
✅ Blood test       →   No one owns     →  ✅ Blood test done
✅ Referral noted   →    this middle    →  ❌ Referral not sent
✅ Follow-up ×7d    →                   →  ⏳ Follow-up unknown
```

---

## The Solution

CareLoop is not a reminder app. It is not a dashboard.

It is an **autonomous care execution agent** — it converts every clinical instruction into a tracked, dependency-aware workflow object, executes it, self-heals on failure, and closes the journey only when every action is verified complete.

```
Doctor writes note  →  AI extracts actions  →  Agent executes  →  Patient confirmed  →  Journey closed
        │                     │                      │                    │                    │
       0s                   1.2s                    3s                   4s               verified
```

---

## Demo — Ramesh Kumar, 62M, Chest Pain

> Doctor's note submitted at **09:00**
> *"ECG, lipid profile blood test, cardiology referral, review after 7 days."*

| Time | Event | Actor | Status |
|------|-------|--------|--------|
| 09:01 | 4 care actions extracted with confidence scores | CareLoop AI | ✅ |
| 09:01 | Dependency graph built — review blocked on ECG + labs | CareLoop AI | ✅ |
| 09:02 | ECG booked — Day 1, 09:00 slot confirmed | Agent | ✅ |
| 09:02 | Blood test — lab notified, collection scheduled | Agent | ✅ |
| 09:02 | Cardiology referral sent to department | Agent | ✅ |
| 09:03 | Ramesh receives WhatsApp: *"Done ✅ — tap to confirm"* | Patient | ✅ |
| Day 2 | **Cardiology referral absent — no event received** | CareLoop | 🚨 Gap |
| Day 3 | **ECG still unscheduled — deadline passed** | CareLoop | 🚨 Gap |
| Day 3 | Coordinator alerted · Patient contacted · Slot booked | Coordinator | 🔄 |
| Day 4 | ECG completed · Doctor review dependency unlocked | Agent | ✅ |
| Day 4 | Doctor reviews results · All actions verified | Doctor | ✅ |
| Day 4 | **Journey CLOSED — audit trail locked** | CareLoop | 🔒 |

> Zero coordinator involvement on the happy path.
> Two gaps caught before any human noticed.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        CARELOOP ENGINE                          │
│                                                                 │
│  1. EXTRACT    Doctor note → Clinical NLP → Structured actions  │
│                                                                 │
│  2. CLASSIFY   Explicit (>85%) ──── executes automatically      │
│                Conditional (50–85%) ─ flags for human review    │
│                Ambiguous (<50%) ──── holds, never auto-creates  │
│                                                                 │
│  3. GRAPH      Actions linked by clinical dependency order      │
│                Review blocked until ECG + labs verified         │
│                                                                 │
│  4. EXECUTE    Agent books slots · sends referrals · notifies   │
│                                                                 │
│  5. MONITOR    Gap detector runs every 5 min across journeys    │
│                Overdue · Missing · Blocked · Unreviewed         │
│                                                                 │
│  6. HEAL       Fail → retry alt slot → retry alt dept → escalate│
│                Most failures invisible to humans                │
│                                                                 │
│  7. CLOSE      All actions VERIFIED → doctor notified → locked  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Care Action State Machine

Every clinical instruction becomes a stateful object. A journey cannot close until every dependency chain reaches **VERIFIED**.

```
  CREATED → VALIDATED → ASSIGNED → SCHEDULED → IN_PROGRESS → COMPLETED → VERIFIED
                                                                              │
                                                                        JOURNEY CLOSED

  Exception states:
  ┌──────────┐    ┌──────────┐    ┌───────────┐    ┌───────────┐
  │  BLOCKED │    │  OVERDUE │    │ ESCALATED │    │ CANCELLED │
  │ waiting  │    │ deadline │    │ human req │    │ doctor    │
  │ on deps  │    │ passed   │    │ needed    │    │ cancelled │
  └──────────┘    └──────────┘    └───────────┘    └───────────┘
```

> A completed action does not close the journey.
> Every dependent downstream action must also reach VERIFIED.

---

## Care Gap Detection — 5 Types Monitored

| Gap Type | What CareLoop Detects |
|----------|----------------------|
| 🔴 **Order without action** | Instruction extracted but no scheduling/referral event follows |
| 🔴 **Result without review** | Test completed but required review action never starts |
| 🔴 **Notified but not scheduled** | Reminder delivered but no appointment event received |
| 🔴 **Completed without next step** | Prerequisite done but dependent action hasn't started |
| 🔴 **Overdue action** | Deadline passed without verified completion |

---

## The Fallback

> The single most important design decision in CareLoop

The AI reads the doctor's note and extracts tasks. But notes are messy. Instructions are vague. Context is missing.

**Our rule:** A wrong closure is a missed care event. A delayed one is recoverable.

```
AI confidence below threshold  →  Coordinator reviews before task is created
Completion signal absent       →  Task stays UNVERIFIED, never auto-closed
Ambiguous instruction          →  Held for human confirmation, never assumed
```

CareLoop never assumes silence means done.
CareLoop never changes clinical intent.
CareLoop never closes a gap on missing data.

---

## Features

| Feature | Description | Type |
|---------|-------------|------|
| 🧠 Clinical NLP Extraction | Reads doctor's note → structured action list with confidence scores | ⭐ Wow |
| 🎯 Confidence-Gated Autonomy | Explicit executes · Conditional flags · Ambiguous holds | ⭐ Wow |
| 🔗 Dependency Graph Engine | Links care steps in clinical order · downstream stays blocked | ⭐ Wow |
| ⚡ LLM Function Calling | Agent autonomously decides which booking API to invoke | ⭐ Wow |
| 🔄 Self-Healing Retry | Fail → alt slot → alt dept → escalate. Failures invisible to humans | ⭐ Wow |
| 🚨 Care Gap Detector | Cron monitors 5 broken transition types across all live journeys | Core |
| 📊 Exception-Only Dashboard | Coordinators see only what the agent couldn't resolve | Core |
| 💬 WhatsApp Confirmations | One message · one tap · state update confirmed | Core |
| 🔒 Doctor Closure Loop | Notified only when all actions are VERIFIED — not before | Core |
| 📜 Full Audit Trail | Every autonomous decision replayable · timestamped · accountable | Core |

---

## Why CareLoop Wins

| Existing tools | CareLoop |
|----------------|----------|
| Detect gap → notify human → wait | Detect order → execute → notify human only on failure |
| Coordinators see everything | Coordinators see only what the agent couldn't fix |
| Track orders within one system | Cross-department execution with dependency awareness |
| Coordinator must act | Agent acts · coordinator is the last resort |
| Reactive — surfaces past failures | Proactive — prevents failures before anyone notices |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React + TypeScript + Tailwind | Doctor · Coordinator · Patient views |
| Backend | Spring Boot / Java | Orchestrator · State machine · Gap detector |
| AI / NLP | Python + FastAPI + Claude API | Extraction · Confidence scoring · Function calling |
| Database | PostgreSQL | Journeys · Care actions · Audit log |
| Notifications | Twilio WhatsApp Sandbox | Patient confirmations |
| Real-time | Server-Sent Events (SSE) | Live execution log |
| Auth | JWT + Role-based access | Doctor · Coordinator · Patient roles |
| Infra | Docker + Railway + Vercel | Containerised · stable demo |

---

## User Roles

| Role | What they see | Primary job |
|------|--------------|-------------|
| 🩺 **Doctor** | Note input · extracted actions · closure notification | Submit note · validate ambiguous actions |
| 📋 **Coordinator** | Exception-only queue — what the agent couldn't resolve | Resolve gaps · verify completions |
| 👤 **Patient** | Journey timeline — every promised action and its status | Confirm scheduling · complete steps |
| 🏥 **Department** | Incoming task events — lab · referral · pharmacy | Execute and confirm actions |

---

## Metrics We Track

```
Actions extracted / total instructions          →  NLP accuracy
Tasks reaching VERIFIED state                   →  Execution reliability
Care gaps detected in demo dataset              →  Gap detection coverage
Time from gap detection to coordinator alert    →  Response latency
Journeys reaching CLOSED state                  →  End-to-end completion rate
Manual coordinator checks avoided              →  Agent autonomy rate
```

---

## 24-Hour MVP Scope

```
  KEEP                              CUT
  ────────────────────────────      ──────────────────────────────
  ✅ Clinical note extraction        ❌ Predictive gap analytics
  ✅ Care action state machine        ❌ Family access portal
  ✅ Dependency graph                 ❌ Multilingual messaging
  ✅ Care gap detection               ❌ One-tap appointment booking
  ✅ Coordinator exception dashboard  ❌ Multi-hospital integration
  ✅ Simulated lab/referral events    ❌ Complex risk models
  ✅ One notification channel         ❌ Full EHR integration
  ✅ Journey closure + audit trail    ❌ Large-scale analytics
```

**Non-negotiable:** The Care Journey State Engine.
Without it, we have a to-do list. With it, we have a system that knows the difference between a journey that's progressing and one that's silently stalled.

---

## Team

Built in 24 hours for VVCE Hackathon 2026 · Problem Statement HLS006

| Member | Role |
|--------|------|
| — | Backend · State machine · Agent orchestration |
| — | AI/NLP · Claude API integration · Gap detector |
| — | Frontend · UX · Demo scenario design |

---

<div align="center">

**"CareLoop doesn't remind — it executes."**

*Doctor orders it → CareLoop tracks it → catches where it's stuck → alerts the right person → verifies it's done → closes the journey.*

</div>
