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
 * ============================================================
 */

const express = require('express');
const router = express.Router();

const supabase = require('../superbase');
const { transition } = require('../services/stateMachine');
const { unblockDependents } = require('../services/executor');
const { checkPlanAnomaly } = require('../services/anomaly');

const DEMO_MODE = process.env.DEMO_MODE === 'true';

function isValidUUID(value) {
    return (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
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

    if (
        DEMO_MODE &&
        department === 'Lab' &&
        process.env.FORCE_FAILURE === 'true'
    ) {
        process.env.FORCE_FAILURE = 'false';
        throw new Error('Mock Lab booking failure triggered for demo');
    }

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

router.post('/complete/:actionId', async (req, res) => {
    try {
        const { actionId } = req.params;
        const { result_text } = req.body;

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

        if (
            action.state === 'COMPLETED' ||
            action.state === 'VERIFIED'
        ) {
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
                    error:
                        `Unable to transition action ${actionId} ` +
                        `to IN_PROGRESS`
                });
            }
        }

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

        try {
            await unblockDependents(actionId);
        } catch (dependencyError) {
            console.error(
                `Failed to unblock dependents for ${actionId}:`,
                dependencyError
            );
        }

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

router.post('/reset-demo', (req, res) => {
    process.env.FORCE_FAILURE = 'false';

    return res.json({
        success: true,
        message: 'Mock demo failure state reset'
    });
});

module.exports = router;
