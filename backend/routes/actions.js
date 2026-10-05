const express = require('express');

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
        }

        return res.json({
            success: true,
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