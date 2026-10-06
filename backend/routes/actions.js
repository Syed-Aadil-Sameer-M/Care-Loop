const express = require('express');
<<<<<<< HEAD

const ACTION_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createActionRouter(injectedDependencies) {
    const actionRouter = express.Router();

    actionRouter.post('/:actionId/review', async (req, res) => {
        const { actionId } = req.params;
        const { decision, reason } = req.body || {};

        if (!ACTION_ID_PATTERN.test(actionId)) {
            return res.status(400).json({
                success: false,
                error: 'actionId must be a valid UUID.'
            });
        }

        if (!['APPROVE', 'REJECT'].includes(decision)) {
            return res.status(400).json({
                success: false,
                error: 'decision must be APPROVE or REJECT.'
            });
        }

        if (typeof reason !== 'string' || !reason.trim()) {
            return res.status(400).json({
                success: false,
                error: 'A non-empty reason is required.'
            });
        }

        let dependencies = injectedDependencies;
        if (!dependencies) {
            dependencies = {
                supabase: require('../superbase'),
                transition: require('../services/stateMachine').transition,
                executeAction: require('../services/executor').executeAction
            };
        }

        let action;
        try {
            const result = await dependencies.supabase
                .from('care_actions')
                .select('*')
                .eq('id', actionId)
                .maybeSingle();

            if (result.error) {
                return res.status(500).json({
                    success: false,
                    error: 'Unable to load the action for review.'
                });
            }
            action = result.data;
        } catch (_error) {
            return res.status(500).json({
                success: false,
                error: 'Unable to load the action for review.'
            });
        }

        if (!action) {
            return res.status(404).json({
                success: false,
                error: 'Action not found.'
            });
        }

        if (action.state !== 'HELD') {
            return res.status(409).json({
                success: false,
                error: `Action review requires HELD state; received ${action.state}.`
            });
        }

        const targetState = decision === 'APPROVE' ? 'VALIDATED' : 'CANCELLED';
        let updated;
        try {
            updated = await dependencies.transition(
                actionId,
                targetState,
                'DOCTOR',
                reason.trim(),
                {},
                {
                    expectedState: 'HELD',
                    auditMeta: {
                        decision,
                        decision_at: new Date().toISOString()
                    }
                }
            );
        } catch (_error) {
            return res.status(500).json({
                success: false,
                error: 'Unable to record the doctor review.'
            });
        }

        if (!updated) {
            return res.status(409).json({
                success: false,
                error: 'Action state changed before review could be recorded.'
            });
        }

        if (updated.state !== targetState) {
            return res.status(409).json({
                success: false,
                error: `Review did not produce the required ${targetState} state.`
            });
        }

        if (decision === 'APPROVE') {
            Promise.resolve()
                .then(() => dependencies.executeAction(updated))
                .catch((error) => {
                    console.error(
                        `Approved action execution failed for ${actionId}:`,
                        error
                    );
                });
=======
const router = express.Router();

const supabase = require('../supabase');
const { transition } = require('../services/stateMachine');
const { executeAction } = require('../services/executor');

/*
 * ============================================================
 * ACTION ROUTES
 * ============================================================
 *
 * Responsibilities:
 * - Change action states through the state machine
 * - Allow doctor approval/rejection of HELD actions
 * - Trigger execution after approval
 * - Provide escalated actions for the coordinator dashboard
 * - Provide dashboard statistics
 *
 * IMPORTANT:
 * stateMachine.js remains the authority for valid state
 * transitions. Do NOT update care_actions.state directly here.
 *
 * Ownership:
 * routes/actions.js   = API/controller layer
 * stateMachine.js     = state transition authority + audit
 * executor.js         = action execution/routing
 * selfHeal.js         = retry/backoff/escalation
 * anomaly.js          = anomaly detection
 * groq.js              = AI extraction/analysis
 *
 * ============================================================
 */

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
 * ============================================================
 * PATCH /api/actions/:id/state
 *
 * Used by the doctor/coordinator to change an action state.
 *
 * Main demo flow:
 *
 * HELD
 *   ↓
 * Doctor approves
 *   ↓
 * VALIDATED
 *   ↓
 * executor.js
 *   ↓
 * ASSIGNED → SCHEDULED
 *
 * Or:
 *
 * HELD
 *   ↓
 * Doctor rejects
 *   ↓
 * REJECTED
 *
 * State changes MUST go through stateMachine.js.
 * ============================================================
 */
router.patch('/:id/state', async (req, res) => {
    try {
        const { id } = req.params;
        const { new_state, actor, reason } = req.body;

        // ----------------------------------------------------
        // Validate action ID
        // ----------------------------------------------------
        if (!UUID_REGEX.test(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid action ID'
            });
        }

        // ----------------------------------------------------
        // Validate request
        // ----------------------------------------------------
        if (!new_state) {
            return res.status(400).json({
                success: false,
                error: 'new_state is required'
            });
        }

        const finalActor = actor || 'Doctor';
        const finalReason = reason || 'Manual state update';

        // ----------------------------------------------------
        // Fetch current action
        // ----------------------------------------------------
        const { data: action, error: fetchError } = await supabase
            .from('care_actions')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Action not found'
                });
            }

            throw new Error(
                `Failed to fetch action: ${fetchError.message}`
            );
        }

        // ----------------------------------------------------
        // Doctor approval/rejection rules
        // ----------------------------------------------------
        //
        // HELD actions are waiting for human review.
        // Only a Doctor can approve or reject them.
        //
        if (action.state === 'HELD') {
            if (!['VALIDATED', 'REJECTED'].includes(new_state)) {
                return res.status(400).json({
                    success: false,
                    error:
                        'A HELD action can only be VALIDATED or REJECTED by a Doctor'
                });
            }

            if (finalActor !== 'Doctor') {
                return res.status(403).json({
                    success: false,
                    error:
                        'Only a Doctor can approve or reject a HELD action'
                });
            }
        }

        // ----------------------------------------------------
        // Perform state transition
        // ----------------------------------------------------
        const result = await transition(
            id,
            new_state,
            finalActor,
            finalReason
        );

        // stateMachine returns null for an invalid transition.
        if (!result) {
            return res.status(409).json({
                success: false,
                error: `Invalid transition: ${action.state} → ${new_state}`
            });
        }

        // ----------------------------------------------------
        // If Doctor approved HELD action:
        //
        // HELD → VALIDATED
        //
        // Start execution asynchronously.
        // ----------------------------------------------------
        if (
            action.state === 'HELD' &&
            new_state === 'VALIDATED'
        ) {
            executeAction(result).catch(error => {
                console.error(
                    `Failed to execute approved action ${id}:`,
                    error
                );
            });
>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93
        }

        return res.json({
            success: true,
<<<<<<< HEAD
            action_id: actionId,
            previous_state: 'HELD',
            state: targetState
        });
    });

    return actionRouter;
}

const router = createActionRouter();
module.exports = router;
module.exports.createActionRouter = createActionRouter;
=======
            data: result
        });

    } catch (err) {
        console.error('PATCH /actions/:id/state error:', err);

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


/*
 * ============================================================
 * GET /api/actions/escalated
 *
 * Returns actions requiring coordinator attention.
 *
 * Includes:
 * - ESCALATED
 * - OVERDUE
 *
 * Used by the coordinator dashboard.
 * ============================================================
 */
router.get('/escalated', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('care_actions')
            .select(`
                *,
                care_journeys (
                    patient_id,
                    patients (
                        name
                    )
                )
            `)
            .in('state', ['ESCALATED', 'OVERDUE'])
            .order('updated_at', { ascending: false });

        if (error) {
            throw new Error(
                `Failed to fetch escalated actions: ${error.message}`
            );
        }

        return res.json({
            success: true,
            data: data || []
        });

    } catch (err) {
        console.error('GET /actions/escalated error:', err);

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


/*
 * ============================================================
 * GET /api/actions/stats
 *
 * Dashboard metrics.
 *
 * Returns:
 * - active journeys
 * - auto-resolved actions
 * - escalated actions
 * - closed journeys
 * - resolution rate
 *
 * We count COMPLETED actions directly from care_actions
 * instead of relying on audit_log because the actor completing
 * an action may be Department rather than AGENT.
 * ============================================================
 */
router.get('/stats', async (req, res) => {
    try {
        const [
            activeResult,
            resolvedResult,
            escalatedResult,
            closedResult
        ] = await Promise.all([

            // Active journeys
            supabase
                .from('care_journeys')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'ACTIVE'),

            // Successfully completed actions
            supabase
                .from('care_actions')
                .select('id', { count: 'exact', head: true })
                .eq('state', 'COMPLETED'),

            // Escalated actions
            supabase
                .from('care_actions')
                .select('id', { count: 'exact', head: true })
                .eq('state', 'ESCALATED'),

            // Closed journeys
            supabase
                .from('care_journeys')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'CLOSED')
        ]);

        // ----------------------------------------------------
        // Check Supabase errors
        // ----------------------------------------------------
        if (activeResult.error) {
            throw new Error(
                `Failed to count active journeys: ${activeResult.error.message}`
            );
        }

        if (resolvedResult.error) {
            throw new Error(
                `Failed to count completed actions: ${resolvedResult.error.message}`
            );
        }

        if (escalatedResult.error) {
            throw new Error(
                `Failed to count escalated actions: ${escalatedResult.error.message}`
            );
        }

        if (closedResult.error) {
            throw new Error(
                `Failed to count closed journeys: ${closedResult.error.message}`
            );
        }

        const activeJourneys = activeResult.count || 0;
        const autoResolved = resolvedResult.count || 0;
        const escalated = escalatedResult.count || 0;
        const closedJourneys = closedResult.count || 0;

        // ----------------------------------------------------
        // Resolution rate
        // ----------------------------------------------------
        const totalResolvedOrEscalated =
            autoResolved + escalated;

        const resolutionRate =
            totalResolvedOrEscalated > 0
                ? Math.round(
                    (autoResolved / totalResolvedOrEscalated) * 100
                )
                : 100;

        return res.json({
            success: true,
            data: {
                active_journeys: activeJourneys,
                auto_resolved: autoResolved,
                escalated,
                closed_journeys: closedJourneys,
                resolution_rate: resolutionRate
            }
        });

    } catch (err) {
        console.error('GET /actions/stats error:', err);

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


module.exports = router;
>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93
