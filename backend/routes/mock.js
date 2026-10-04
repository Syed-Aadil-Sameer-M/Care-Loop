```javascript
/*
 * ============================================================
 * SUDARSHAN — DEPARTMENT SIMULATOR CONTRACT
 * ============================================================
 *
 * This file exposes the MOCK department APIs used by the
 * Department Simulator UI.
 *
 * IMPORTANT:
 * This file simulates external department systems.
 * It must NOT contain workflow/state-machine logic that belongs
 * in services/stateMachine.js or services/executor.js.
 *
 * ------------------------------------------------------------
 * 1. BOOKING ENDPOINTS
 * ------------------------------------------------------------
 *
 * The simulator/executor may call:
 *
 *   POST /api/mock/lab/book
 *   POST /api/mock/referral/send
 *   POST /api/mock/pharmacy/log
 *   POST /api/mock/clinic/book
 *
 * Request body:
 *
 *   {
 *     "action_id": "<care_actions.id>"
 *   }
 *
 * The endpoint should:
 *   - validate action_id
 *   - verify the action exists
 *   - verify the action department matches the endpoint
 *   - find the earliest available department slot
 *   - reserve that slot
 *   - store booked_by_action_id
 *   - return the slot information
 *
 * Example successful response:
 *
 *   {
 *     "success": true,
 *     "department": "Lab",
 *     "slot": "10/10/2026, 10:00:00 am",
 *     "scheduled_at": "2026-10-10T10:00:00+00:00",
 *     "slot_id": "<department_slots.id>"
 *   }
 *
 * The endpoint should return HTTP 500 for simulated external
 * failures so services/executor.js can send the action into
 * selfHeal.js.
 *
 * ------------------------------------------------------------
 * 2. DEPARTMENT COMPLETION
 * ------------------------------------------------------------
 *
 * Sudarshan's Department Simulator calls:
 *
 *   POST /api/mock/complete/:actionId
 *
 * Request body:
 *
 *   {
 *     "result_text": "Normal ECG"
 *   }
 *
 * DO NOT directly update the action state here.
 *
 * The correct lifecycle is:
 *
 *   SCHEDULED
 *       ↓
 *   IN_PROGRESS
 *       ↓
 *   COMPLETED
 *
 * All state changes MUST go through:
 *
 *   services/stateMachine.js
 *
 * This guarantees the transition rules and audit logging remain
 * centralized.
 *
 * After successful COMPLETED:
 *
 *   1. Store the department result.
 *   2. Unblock dependent actions.
 *   3. Trigger anomaly detection asynchronously.
 *
 * The Department Simulator should not decide whether an anomaly
 * exists and should not directly create follow-up actions.
 * That logic belongs to services/anomaly.js.
 *
 * ------------------------------------------------------------
 * 3. FORCE FAILURE DEMO CONTROL
 * ------------------------------------------------------------
 *
 * The demo UI may call:
 *
 *   POST /api/mock/force-failure
 *
 * This should make ONLY the next LAB booking fail once.
 *
 * Purpose:
 *   Demonstrate:
 *
 *   Booking failure
 *       ↓
 *   Executor catches error
 *       ↓
 *   selfHeal.js
 *       ↓
 *   retry / alternate slot
 *       ↓
 *   success OR escalation
 *
 * Do not put retry logic in this route.
 *
 * ------------------------------------------------------------
 * 4. IMPORTANT OWNERSHIP RULE
 * ------------------------------------------------------------
 *
 * routes/mock.js
 *   = simulate department/external APIs
 *
 * executor.js
 *   = execute actions and route them to departments
 *
 * stateMachine.js
 *   = authorize every state transition + audit it
 *
 * selfHeal.js
 *   = retry/backoff/escalation after execution failure
 *
 * anomaly.js
 *   = analyze completed results and suggest new care actions
 *
 * groq.js
 *   = AI extraction / anomaly analysis / failure analysis
 *
 * ------------------------------------------------------------
 * 5. DO NOT IMPLEMENT HERE
 * ------------------------------------------------------------
 *
 * Do NOT add:
 *   - Groq calls
 *   - retry loops
 *   - dependency decision logic
 *   - direct state updates
 *   - anomaly-generation logic
 *   - doctor approval/rejection logic
 *
 * Keep this file focused on behaving like a simple mock
 * external department service.
 *
 * ============================================================
 */
```

// routes/mock.js

const express = require('express');

const router = express.Router();

const supabase = require('../supabase');
const { transition } = require('../services/stateMachine');
const { unblockDependents } = require('../services/executor');
const { checkPlanAnomaly } = require('../services/anomaly');

const DEMO_MODE = process.env.DEMO_MODE === 'true';

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function isValidUUID(value) {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAction(actionId) {
    if (!isValidUUID(actionId)) {
        throw new Error('Invalid action ID');
    }

    const { data, error } = await supabase
        .from('care_actions')
        .select('*')
        .eq('id', actionId)
        .single();

    if (error) {
        throw new Error(`Failed to fetch action: ${error.message}`);
    }

    if (!data) {
        throw new Error(`Action ${actionId} not found`);
    }

    return data;
}

/**
 * Book the earliest available slot for a department.
 *
 * actionId is stored in department_slots.booked_by_action_id
 * so the booking can always be traced back to the action.
 *
 * DEMO_MODE failure:
 * FORCE_FAILURE=true causes the next LAB booking to fail once.
 */
async function bookSlot(department, actionId) {
    if (!actionId) {
        throw new Error('action_id is required for slot booking');
    }

    const action = await getAction(actionId);

    if (action.department !== department) {
        throw new Error(
            `Department mismatch: action belongs to ${action.department}, ` +
            `but ${department} booking was requested`
        );
    }

    if (!['VALIDATED', 'ASSIGNED'].includes(action.state)) {
        throw new Error(
            `Action ${actionId} cannot be booked from state ${action.state}`
        );
    }

    // ----------------------------------------------------------
    // DEMO FAILURE INJECTION
    // ----------------------------------------------------------
    //
    // Only Lab booking is affected.
    // The previous implementation used a global flag that could
    // accidentally make Cardiology/Pharmacy/Clinic fail too.
    //
    if (
        DEMO_MODE &&
        department === 'Lab' &&
        process.env.FORCE_FAILURE === 'true'
    ) {
        process.env.FORCE_FAILURE = 'false';

        throw new Error('Mock Lab booking failure triggered for demo');
    }

    // ----------------------------------------------------------
    // FIND EARLIEST FREE SLOT
    // ----------------------------------------------------------

    const { data: slots, error: slotError } = await supabase
        .from('department_slots')
        .select('id, slot_time')
        .eq('department', department)
        .eq('is_booked', false)
        .gt('slot_time', new Date().toISOString())
        .order('slot_time', { ascending: true })
        .limit(5);

    if (slotError) {
        throw new Error(
            `Failed to fetch available ${department} slots: ${slotError.message}`
        );
    }

    if (!slots || slots.length === 0) {
        throw new Error(`No available slots for ${department}`);
    }

    // ----------------------------------------------------------
    // CLAIM SLOT
    // ----------------------------------------------------------
    //
    // Because another action could claim the same slot between
    // SELECT and UPDATE, condition the update on is_booked=false.
    //
    for (const slot of slots) {
        const { data: bookedSlot, error: bookingError } = await supabase
            .from('department_slots')
            .update({
                is_booked: true,
                booked_by_action_id: actionId
            })
            .eq('id', slot.id)
            .eq('is_booked', false)
            .select('id, slot_time, booked_by_action_id')
            .maybeSingle();

        if (bookingError) {
            throw new Error(
                `Failed to book ${department} slot: ${bookingError.message}`
            );
        }

        // Successfully claimed the slot.
        if (bookedSlot) {
            return {
                slot: new Date(bookedSlot.slot_time).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata'
                }),
                scheduled_at: bookedSlot.slot_time,
                slot_id: bookedSlot.id
            };
        }
    }

    throw new Error(
        `All available ${department} slots were taken before booking completed`
    );
}

/**
 * ------------------------------------------------------------
 * BOOKING ENDPOINTS
 * ------------------------------------------------------------
 *
 * These are the mock external APIs used by executor.js.
 */

router.post('/lab/book', async (req, res) => {
    try {
        const { action_id } = req.body;

        const result = await bookSlot('Lab', action_id);

        return res.json({
            success: true,
            department: 'Lab',
            ...result
        });
    } catch (error) {
        console.error('Mock Lab booking failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/referral/send', async (req, res) => {
    try {
        const { action_id } = req.body;

        const result = await bookSlot('Cardiology', action_id);

        return res.json({
            success: true,
            department: 'Cardiology',
            ...result
        });
    } catch (error) {
        console.error('Mock Cardiology referral failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/pharmacy/log', async (req, res) => {
    try {
        const { action_id } = req.body;

        const result = await bookSlot('Pharmacy', action_id);

        return res.json({
            success: true,
            department: 'Pharmacy',
            ...result
        });
    } catch (error) {
        console.error('Mock Pharmacy booking failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/clinic/book', async (req, res) => {
    try {
        const { action_id } = req.body;

        const result = await bookSlot('Clinic', action_id);

        return res.json({
            success: true,
            department: 'Clinic',
            ...result
        });
    } catch (error) {
        console.error('Mock Clinic booking failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * ------------------------------------------------------------
 * COMPLETE ACTION
 * ------------------------------------------------------------
 *
 * Department Simulator calls:
 *
 * POST /api/mock/complete/:actionId
 *
 * Body:
 * {
 *   "result_text": "Normal ECG"
 * }
 *
 * Lifecycle:
 *
 * SCHEDULED
 *     ↓
 * IN_PROGRESS
 *     ↓
 * COMPLETED
 *     ↓
 * unblock dependencies
 *     ↓
 * anomaly detection
 */
router.post('/complete/:actionId', async (req, res) => {
    try {
        const { actionId } = req.params;
        const { result_text } = req.body;

        // --------------------------------------------------------
        // VALIDATE INPUT
        // --------------------------------------------------------

        if (!isValidUUID(actionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid action ID'
            });
        }

        if (
            typeof result_text !== 'string' ||
            result_text.trim().length === 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'result_text is required'
            });
        }

        const action = await getAction(actionId);

        // --------------------------------------------------------
        // IDEMPOTENCY
        // --------------------------------------------------------
        //
        // If the simulator sends the same completion twice, do not
        // create duplicate transitions, audits, dependency releases
        // or anomaly checks.
        //
        if (action.state === 'COMPLETED' || action.state === 'VERIFIED') {
            return res.json({
                success: true,
                already_completed: true,
                action_id: actionId,
                state: action.state,
                result_text: action.result_text
            });
        }

        if (!['SCHEDULED', 'IN_PROGRESS'].includes(action.state)) {
            return res.status(409).json({
                success: false,
                error:
                    `Action cannot be completed from state ${action.state}. ` +
                    `Expected SCHEDULED or IN_PROGRESS.`
            });
        }

        // --------------------------------------------------------
        // SCHEDULED → IN_PROGRESS
        // --------------------------------------------------------

        if (action.state === 'SCHEDULED') {
            const started = await transition(
                actionId,
                'IN_PROGRESS',
                'Department',
                'Department simulator started processing action'
            );

            if (!started) {
                return res.status(409).json({
                    success: false,
                    error: `Unable to transition action ${actionId} to IN_PROGRESS`
                });
            }
        }

        // --------------------------------------------------------
        // IN_PROGRESS → COMPLETED
        // --------------------------------------------------------
        //
        // result_text is stored through the state machine so the
        // state change + audit remain part of the same workflow.
        //

        const completed = await transition(
            actionId,
            'COMPLETED',
            'Department',
            'Result entered by department',
            {
                result_text: result_text.trim()
            }
        );

        if (!completed) {
            return res.status(409).json({
                success: false,
                error: `Unable to complete action ${actionId}`
            });
        }

        // --------------------------------------------------------
        // UNBLOCK DEPENDENTS
        // --------------------------------------------------------
        //
        // This function is responsible for checking whether ALL
        // dependencies of waiting actions are actually completed.
        //
        try {
            await unblockDependents(actionId);
        } catch (dependencyError) {
            console.error(
                `Failed to unblock dependents for ${actionId}:`,
                dependencyError
            );

            // Completion itself succeeded, so don't turn the action
            // into a false failure. The watchdog can recover the
            // dependency-processing problem.
        }

        // --------------------------------------------------------
        // ANOMALY DETECTION
        // --------------------------------------------------------
        //
        // This is deliberately asynchronous.
        //
        // Department completion should not fail merely because the
        // AI anomaly service is temporarily unavailable.
        //

        let anomalyCheckTriggered = false;

        if (result_text.trim()) {
            anomalyCheckTriggered = true;

            checkPlanAnomaly(
                action.journey_id,
                actionId,
                result_text.trim()
            ).catch((error) => {
                console.error(
                    `Anomaly detection failed for action ${actionId}:`,
                    error
                );
            });
        }

        return res.json({
            success: true,
            action_id: actionId,
            state: 'COMPLETED',
            result_text: result_text.trim(),
            anomaly_check_triggered: anomalyCheckTriggered
        });
    } catch (error) {
        console.error('Mock action completion failed:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * ------------------------------------------------------------
 * FORCE FAILURE
 * ------------------------------------------------------------
 *
 * Used by Indi's demo controls.
 *
 * POST /api/mock/force-failure
 *
 * The next LAB booking will fail exactly once.
 */
router.post('/force-failure', (req, res) => {
    if (!DEMO_MODE) {
        return res.status(403).json({
            success: false,
            error: 'Force-failure demo control is disabled outside DEMO_MODE'
        });
    }

    process.env.FORCE_FAILURE = 'true';

    return res.json({
        success: true,
        message: 'Next Lab booking will fail once for the self-healing demo'
    });
});

/**
 * ------------------------------------------------------------
 * OPTIONAL DEMO RESET
 * ------------------------------------------------------------
 *
 * Useful for presentations/testing.
 * It only resets the in-memory failure switch; it does not
 * modify database state.
 */
router.post('/reset-demo', (req, res) => {
    process.env.FORCE_FAILURE = 'false';

    return res.json({
        success: true,
        message: 'Mock demo failure state reset'
    });
});

module.exports = router;