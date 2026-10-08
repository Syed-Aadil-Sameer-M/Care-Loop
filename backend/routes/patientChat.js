/*
 * ============================================================
 * FEATURE 5 — PATIENT CHAT / PATIENT REPLY SIMULATOR
 * IMPLEMENTATION INSTRUCTIONS FOR TARUN
 * ============================================================
 *
 * PURPOSE
 * -------
 * Implement Feature 5 as a simulated patient conversation.
 *
 * The frontend will behave like a WhatsApp-style patient chat.
 * The patient can type natural-language messages such as:
 *
 *   "Yes, I completed the blood test."
 *   "I can't come tomorrow, can I come Friday?"
 *   "I'm having severe pain after taking the medicine."
 *
 * The backend must understand the patient's intent using the
 * EXISTING Groq implementation in:
 *
 *   backend/groq.js
 *
 * using the configured gpt-oss-120b model.
 *
 * The LLM identifies the patient's intent.
 * The LLM MUST NOT directly decide or modify the action state.
 *
 * The authoritative state transition must always go through:
 *
 *   backend/services/stateMachine.js
 *
 *
 * ============================================================
 * IMPORTANT ARCHITECTURE RULES
 * ============================================================
 *
 * 1. DO NOT MODIFY:
 *
 *      backend/routes/patient.js
 *
 *    That file is ONLY responsible for reading patient records:
 *
 *      GET /api/patients
 *      GET /api/patients/:id
 *
 *    Do not add chat, Groq, state-machine, execution, or
 *    notification logic to patient.js.
 *
 *
 * 2. DO NOT PUT FEATURE 5 INSIDE:
 *
 *      backend/routes/mock.js
 *
 *    mock.js is responsible for department/external API
 *    simulation and already has its own architecture.
 *
 *
 * 3. DO NOT MODIFY stateMachine.js unless absolutely necessary.
 *
 *    The state machine is authoritative.
 *    Do NOT bypass it by directly updating the action state
 *    in Supabase.
 *
 *
 * 4. DO NOT MODIFY executor.js for this feature.
 *
 *
 * 5. DO NOT CREATE ANOTHER GROQ CLIENT.
 *
 *    Use the existing functionality from:
 *
 *      backend/groq.js
 *
 *    Aadil will provide/add:
 *
 *      classifyPatientIntent(message)
 *
 *    Use that function rather than creating another Groq SDK
 *    client or another model configuration inside this route.
 *
 *
 * 6. DO NOT USE TWILIO.
 *
 *    We are NOT implementing real WhatsApp integration.
 *
 *    The WhatsApp experience is simulated entirely in the
 *    frontend.
 *
 *    Do NOT restore:
 *
 *      services/twilio.js
 *      routes/whatsapp.js
 *      Twilio dependency
 *      Twilio environment variables
 *
 *
 * 7. DO NOT DIRECTLY CHANGE DATABASE ACTION STATES.
 *
 *    The route must call stateMachine.js for transitions.
 *
 *
 * ============================================================
 * API CONTRACT
 * ============================================================
 *
 * Endpoint:
 *
 *    POST /api/patient-chat
 *
 * Request body:
 *
 * {
 *   "actionId": "<ACTION UUID>",
 *   "message": "<natural-language patient message>"
 * }
 *
 *
 * Example:
 *
 * {
 *   "actionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
 *   "message": "I can't come tomorrow, can I come Friday?"
 * }
 *
 *
 * The route should:
 *
 *    1. Validate actionId.
 *    2. Validate that message exists and is a string.
 *    3. Retrieve the action from Supabase.
 *    4. Call classifyPatientIntent(message) from groq.js.
 *    5. Determine the intended transition from the detected intent.
 *    6. Check the current action state.
 *    7. Call stateMachine.transition() for the actual transition.
 *    8. Return a structured response to the frontend.
 *
 *
 * ============================================================
 * SUPPORTED PATIENT INTENTS
 * ============================================================
 *
 * The initial supported intents are:
 *
 *    CONFIRM
 *    RESCHEDULE
 *    URGENT
 *    QUESTION
 *    DENY
 *    OTHER
 *
 *
 * Example classification:
 *
 * Patient:
 *    "Yes, I completed the blood test."
 *
 * Groq:
 *
 * {
 *   "intent": "CONFIRM",
 *   "confidence": 0.98,
 *   "reason": "Patient confirms completion of the blood test."
 * }
 *
 *
 * Patient:
 *    "I can't make it tomorrow. Can I come Friday?"
 *
 * Groq:
 *
 * {
 *   "intent": "RESCHEDULE",
 *   "confidence": 0.96,
 *   "reason": "Patient cannot attend the scheduled appointment and
 *               requests another date."
 * }
 *
 *
 * Patient:
 *    "I'm having severe pain after taking the medication."
 *
 * Groq:
 *
 * {
 *   "intent": "URGENT",
 *   "confidence": 0.99,
 *   "reason": "Patient reports a potentially concerning symptom."
 * }
 *
 *
 * ============================================================
 * INTENT → STATE TRANSITION RULES
 * ============================================================
 *
 * IMPORTANT:
 *
 * Do NOT assume:
 *
 *    CONFIRM → COMPLETED
 *
 * is always valid.
 *
 * The current action state MUST be respected.
 *
 *
 * CURRENT STATE MACHINE:
 *
 * CREATED:
 *    → VALIDATED
 *    → HELD
 *    → BLOCKED
 *
 * VALIDATED:
 *    → ASSIGNED
 *    → BLOCKED
 *
 * HELD:
 *    → VALIDATED
 *    → REJECTED
 *    → BLOCKED
 *
 * ASSIGNED:
 *    → SCHEDULED
 *    → ESCALATED
 *
 * BLOCKED:
 *    → VALIDATED
 *    → ASSIGNED
 *
 * SCHEDULED:
 *    → IN_PROGRESS
 *    → OVERDUE
 *    → ESCALATED
 *
 * IN_PROGRESS:
 *    → COMPLETED
 *    → ESCALATED
 *
 * COMPLETED:
 *    → VERIFIED
 *
 * OVERDUE:
 *    → ESCALATED
 *    → COMPLETED
 *
 * ESCALATED:
 *    → ASSIGNED
 *    → COMPLETED
 *
 *
 * Therefore:
 *
 * CONFIRM:
 *    Intended transition = COMPLETED
 *
 *    BUT only perform it if the current state permits
 *    transition to COMPLETED.
 *
 *    Valid examples:
 *
 *       IN_PROGRESS → COMPLETED
 *       OVERDUE     → COMPLETED
 *       ESCALATED   → COMPLETED
 *
 *    Do NOT bypass the state machine if the current state
 *    does not allow COMPLETED.
 *
 *
 * URGENT:
 *    Intended transition = ESCALATED
 *
 *    Valid examples:
 *
 *       SCHEDULED   → ESCALATED
 *       IN_PROGRESS → ESCALATED
 *       OVERDUE     → ESCALATED
 *       ASSIGNED    → ESCALATED
 *
 *
 * RESCHEDULE:
 *    Intended transition = ESCALATED
 *
 *    We currently do NOT have a RESCHEDULED state.
 *
 *    Therefore DO NOT create a new RESCHEDULED state.
 *
 *    A rescheduling request should be escalated to the
 *    care coordinator.
 *
 *
 * QUESTION:
 *    Do NOT automatically change the action state.
 *
 *    Return the detected intent and allow the frontend to
 *    display an appropriate response.
 *
 *
 * DENY:
 *    Do NOT invent a new state.
 *
 *    If no valid transition exists for the current state,
 *    return the intent and explain that coordinator handling
 *    is required.
 *
 *
 * OTHER:
 *    Do NOT modify the action state.
 *
 *
 * ============================================================
 * STATE MACHINE RULE
 * ============================================================
 *
 * The LLM answers:
 *
 *    "What does the patient mean?"
 *
 * The application answers:
 *
 *    "What state transition is legally allowed?"
 *
 * Therefore:
 *
 *       Patient message
 *             ↓
 *       Groq / gpt-oss-120b
 *             ↓
 *       Patient intent
 *             ↓
 *       Business-rule mapping
 *             ↓
 *       stateMachine.transition()
 *             ↓
 *       Supabase + audit
 *
 * NEVER:
 *
 *       Patient message
 *             ↓
 *       Groq
 *             ↓
 *       Direct database UPDATE
 *
 *
 * ============================================================
 * RESPONSE FORMAT
 * ============================================================
 *
 * Return a consistent JSON response.
 *
 * Successful classification + transition example:
 *
 * {
 *   "success": true,
 *   "data": {
 *     "actionId": "...",
 *     "previousState": "IN_PROGRESS",
 *     "intent": "CONFIRM",
 *     "confidence": 0.98,
 *     "newState": "COMPLETED",
 *     "message": "Your care action has been marked as completed."
 *   }
 * }
 *
 *
 * If the intent is understood but the transition is not
 * currently allowed:
 *
 * {
 *   "success": false,
 *   "data": {
 *     "actionId": "...",
 *     "currentState": "SCHEDULED",
 *     "intent": "CONFIRM",
 *     "message": "This action cannot be marked completed from its current state."
 *   }
 * }
 *
 *
 * Do not expose raw Groq errors or internal stack traces
 * to the frontend.
 *
 *
 * ============================================================
 * FRONTEND REQUIREMENT
 * ============================================================
 *
 * Tarun's frontend will consume this endpoint.
 *
 * The frontend should provide a WhatsApp-style chat interface.
 *
 * It should allow:
 *
 *    CareLoop → patient message
 *    Patient  → natural-language response
 *
 * The patient should NOT need to select:
 *
 *    CONFIRM
 *    URGENT
 *    RESCHEDULE
 *
 * from buttons.
 *
 * The whole point of Feature 5 is to demonstrate that the
 * patient can speak naturally and gpt-oss-120b understands
 * the intent.
 *
 *
 * Example frontend conversation:
 *
 *    CareLoop:
 *    "Your blood test is scheduled for tomorrow at 9 AM."
 *
 *    Patient:
 *    "I can't make it tomorrow. Can I go on Friday?"
 *
 *    Backend:
 *    Groq → RESCHEDULE
 *    StateMachine → ESCALATED
 *
 *    CareLoop:
 *    "I've notified the care coordinator about your
 *     rescheduling request."
 *
 *
 * ============================================================
 * IMPORTANT IMPLEMENTATION LIMITS
 * ============================================================
 *
 * Keep Feature 5 minimal.
 *
 * DO NOT add:
 *
 *    - Twilio
 *    - real WhatsApp APIs
 *    - new database tables
 *    - new action states
 *    - another Groq client
 *    - direct Supabase state updates
 *    - retry systems
 *    - dependency logic
 *    - anomaly detection
 *    - executor logic
 *
 * Use the existing architecture.
 *
 * Feature 5 is simply:
 *
 *    Patient Chat
 *         ↓
 *    Intent Classification
 *         ↓
 *    Valid State Transition
 *         ↓
 *    Updated Care Action
 *
 *
 * ============================================================
 * END OF FEATURE 5 INSTRUCTIONS
 * ============================================================
 */

// backend/routes/patientChat.js
const express = require('express');
const router = express.Router();
const supabase = require('../superbase');
const { transition } = require('../services/stateMachine');
const { classifyPatientIntent } = require('../services/groq');

/**
 * Validates whether a given string is a valid UUID
 */
function isValidUUID(uuid) {
    return typeof uuid === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Feature 5: Natural Language Patient Chat Endpoint
 * POST /api/patient-chat
 * Body: { actionId: "UUID", message: "Patient reply text" }
 */

/**
 * GET /api/patient-chat
 * Browser check route
 */
router.get('/', (req, res) => {
    res.json({
        status: 'active',
        message: 'Patient chat service is running. Submit a POST request with { actionId, message } to send a message.'
    });
});

router.post('/', async (req, res) => {
    try {
        const { actionId, message } = req.body;

        // 1. Input Validation
        if (!actionId || !isValidUUID(actionId)) {
            return res.status(400).json({
                success: false,
                data: { message: 'A valid actionId UUID is required.' }
            });
        }

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({
                success: false,
                data: { message: 'A non-empty patient message string is required.' }
            });
        }

        // 2. Retrieve care action from Supabase
        const { data: action, error: fetchError } = await supabase
            .from('care_actions')
            .select('*')
            .eq('id', actionId)
            .single();

        console.log('[PatientChat] Action ID:', actionId);
        console.log('[PatientChat] Supabase action:', action);
        console.log('[PatientChat] Supabase error:', fetchError);

        if (fetchError || !action) {
            return res.status(404).json({
                success: false,
                data: { actionId, message: `Care action ${actionId} not found.` }
            });
        }

        // 3. Classify Patient Intent using groq.js
        const classification = await classifyPatientIntent(message.trim());
        const { intent, confidence, reason } = classification;

        console.log(`[PatientChat] Message: "${message}" | Classified Intent: ${intent} (${confidence})`);

        const previousState = action.state;
        let targetState = null;
        let responseText = '';

        // 4. Determine Target Transition according to Intent Rules
        if (intent === 'CONFIRM') {
            targetState = 'COMPLETED';
            responseText = 'Your care action has been marked as completed.';
        } else if (intent === 'URGENT') {
            targetState = 'ESCALATED';
            responseText = 'Your message has been flagged as URGENT. A doctor or care coordinator is reviewing your record immediately.';
        } else if (intent === 'RESCHEDULE') {
            targetState = 'ESCALATED';
            responseText = 'We have notified your care coordinator about your rescheduling request.';
        } else if (intent === 'QUESTION') {
            return res.json({
                success: true,
                data: {
                    actionId,
                    previousState,
                    intent,
                    confidence,
                    newState: previousState,
                    message: 'Your question has been routed to your care team. They will reply shortly.'
                }
            });
        } else if (intent === 'DENY' || intent === 'OTHER') {
            return res.json({
                success: true,
                data: {
                    actionId,
                    previousState,
                    intent,
                    confidence,
                    newState: previousState,
                    message: 'Thank you for your response. Your care coordinator will review your message.'
                }
            });
        }

        // 5. Authoritative State Transition via stateMachine.js
        if (targetState) {
            const updatedAction = await transition(
                actionId,
                targetState,
                'Patient',
                `Patient Chat [${intent}]: ${reason || message}`,
                { raw_message: message, intent, confidence }
            );

            // If state transition is forbidden from current state
            if (!updatedAction) {
                return res.json({
                    success: false,
                    data: {
                        actionId,
                        currentState: previousState,
                        intent,
                        message: `This action cannot be marked ${targetState.toLowerCase()} from its current state (${previousState}).`
                    }
                });
            }

            // Successful Transition
            return res.json({
                success: true,
                data: {
                    actionId,
                    previousState,
                    intent,
                    confidence,
                    newState: targetState,
                    message: responseText
                }
            });
        }

    } catch (err) {
        console.error('[PatientChat Error]', err.message);
        return res.status(500).json({
            success: false,
            data: { message: 'An unexpected error occurred while processing your message.' }
        });
    }
});

module.exports = router;