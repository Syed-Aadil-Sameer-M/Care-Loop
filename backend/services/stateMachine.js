const supabase = require('../superbase');

const VALID_TRANSITIONS = {
    CREATED: ['VALIDATED', 'HELD', 'BLOCKED'],
    VALIDATED: ['ASSIGNED', 'BLOCKED'],
    HELD: ['VALIDATED', 'BLOCKED', 'CANCELLED'],
    ASSIGNED: ['SCHEDULED', 'ESCALATED'],
    BLOCKED: ['VALIDATED'],
    SCHEDULED: ['IN_PROGRESS', 'OVERDUE', 'ESCALATED'],
    IN_PROGRESS: ['COMPLETED', 'ESCALATED'],
    COMPLETED: ['VERIFIED'],
    OVERDUE: ['ESCALATED', 'COMPLETED'],
    ESCALATED: ['ASSIGNED', 'COMPLETED'],
    CANCELLED: []
};

function createTransition(client) {
    return async function transition(
        actionId,
        newState,
        actor,
        reason,
        meta = {},
        options = {}
    ) {
        // 1. Get current action.
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

        // 2. Check whether transition is allowed.
        const allowed = VALID_TRANSITIONS[action.state] || [];

        if (!allowed.includes(newState)) {
            console.warn(
                `Invalid transition: ${action.state} → ${newState} for ${actionId}`
            );

            return null;
        }

        // 3. Update action state with a compare-and-set condition.
        const transitionedAt = new Date().toISOString();
        const { data: updated, error: updateError } = await client
            .from('care_actions')
            .update({
                state: newState,
                updated_at: transitionedAt,
                ...meta
            })
            .eq('id', actionId)
            .eq('state', action.state)
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

        // 4. Record the transition in the existing audit metadata field.
        const { error: auditError } = await client
            .from('audit_log')
            .insert({
                journey_id: action.journey_id,
                action_id: actionId,
                actor,
                event: `${action.state} → ${newState}`,
                reason,
                meta: {
                    previous_state: action.state,
                    new_state: newState,
                    ...meta,
                    ...options.auditMeta,
                    transitioned_at: transitionedAt
                }
            });

        if (auditError) {
            throw new Error(
                `Action transitioned but audit logging failed: ${auditError.message}`
            );
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