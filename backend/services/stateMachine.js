const supabase = require('../superbase');
const { checkAndUnblockDependents } = require('./dependency');

const VALID_TRANSITIONS = {
    CREATED: ['VALIDATED', 'HELD', 'BLOCKED'],
    VALIDATED: ['ASSIGNED', 'BLOCKED'],
    HELD: ['VALIDATED', 'BLOCKED', 'CANCELLED'],
    ASSIGNED: ['SCHEDULED', 'ESCALATED'],
    BLOCKED: ['VALIDATED', 'ASSIGNED'],
    SCHEDULED: ['IN_PROGRESS', 'OVERDUE', 'ESCALATED'],
    IN_PROGRESS: ['COMPLETED', 'ESCALATED'],
    COMPLETED: ['VERIFIED'],
    OVERDUE: ['ESCALATED', 'COMPLETED'],
    ESCALATED: ['ASSIGNED', 'COMPLETED'],
    CANCELLED: [],
    REJECTED: [],
    VERIFIED: []
};

const VALID_ACTORS = [
    'AGENT',
    'DOCTOR',
    'Doctor',
    'Coordinator',
    'Patient',
    'Department',
    'SYSTEM'
];

function createTransition(client) {
    return async function transition(
        actionId,
        newState,
        actor,
        reason,
        meta = {},
        options = {}
    ) {
        if (!actionId) {
            throw new Error('actionId is required');
        }

        if (!newState) {
            throw new Error('newState is required');
        }

        if (!VALID_ACTORS.includes(actor)) {
            throw new Error(`Invalid actor: ${actor}`);
        }

        if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
            throw new Error('meta must be an object');
        }

        const { data: action, error: fetchError } = await client
            .from('care_actions')
            .select('*')
            .eq('id', actionId)
            .single();

        if (fetchError) {
            throw new Error(
                `Failed to fetch action ${actionId}: ${fetchError.message}`
            );
        }

        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        if (options.expectedState && action.state !== options.expectedState) {
            return null;
        }

        const allowedTransitions = VALID_TRANSITIONS[action.state] || [];
        if (!allowedTransitions.includes(newState)) {
            console.warn(
                `Invalid transition: ${action.state} → ${newState} for ${actionId}`
            );
            return null;
        }

        const transitionedAt = new Date().toISOString();
        let updateQuery = client
            .from('care_actions')
            .update({
                state: newState,
                updated_at: transitionedAt,
                ...meta
            })
            .eq('id', actionId);

        if (action.state) {
            updateQuery = updateQuery.eq('state', action.state);
        }

        const { data: updated, error: updateError } = await updateQuery
            .select()
            .maybeSingle();

        if (updateError) {
            throw new Error(
                `Failed to update action ${actionId}: ${updateError.message}`
            );
        }

        if (!updated) {
            return null;
        }

        const auditMeta = {
            previous_state: action.state,
            new_state: newState,
            ...meta,
            ...options.auditMeta,
            transitioned_at: transitionedAt
        };

        const { error: auditError } = await client
            .from('audit_log')
            .insert({
                journey_id: action.journey_id,
                action_id: actionId,
                actor,
                event: `${action.state} → ${newState}`,
                reason: reason || 'State transition',
                meta: auditMeta
            });

        if (auditError) {
            throw new Error(
                `Action transitioned but audit logging failed: ${auditError.message}`
            );
        }

        if (['COMPLETED', 'VERIFIED'].includes(newState)) {
            try {
                await checkAndUnblockDependents(actionId);
            } catch (dependencyError) {
                console.error(
                    `[StateMachine] Dependency unblock error for action ${actionId}:`,
                    dependencyError
                );
            }
        }

        return updated;
    };
}

const transition = createTransition(supabase);

module.exports = {
    transition,
    createTransition,
    VALID_TRANSITIONS
};
