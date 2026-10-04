const supabase = require('../supabase');

const VALID_TRANSITIONS = {
    CREATED: ['VALIDATED', 'HELD', 'BLOCKED'],
    VALIDATED: ['ASSIGNED', 'BLOCKED'],
    HELD: ['VALIDATED', 'BLOCKED'],
    ASSIGNED: ['SCHEDULED', 'ESCALATED'],
    BLOCKED: ['VALIDATED'],
    SCHEDULED: ['IN_PROGRESS', 'OVERDUE', 'ESCALATED'],
    IN_PROGRESS: ['COMPLETED', 'ESCALATED'],
    COMPLETED: ['VERIFIED'],
    OVERDUE: ['ESCALATED', 'COMPLETED'],
    ESCALATED: ['ASSIGNED', 'COMPLETED']
};

async function transition(
    actionId,
    newState,
    actor,
    reason,
    meta = {}
) {
    // 1. Get current action
    const { data: action, error: fetchError } = await supabase
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

    // 2. Check whether transition is allowed
    const allowed = VALID_TRANSITIONS[action.state] || [];

    if (!allowed.includes(newState)) {
        console.warn(
            `Invalid transition: ${action.state} → ${newState} for ${actionId}`
        );

        return null;
    }

    // 3. Update action state
    const { data: updated, error: updateError } = await supabase
        .from('care_actions')
        .update({
            state: newState,
            updated_at: new Date().toISOString(),
            ...meta
        })
        .eq('id', actionId)
        .select()
        .single();

    if (updateError) {
        throw new Error(
            `Failed to update action ${actionId}: ${updateError.message}`
        );
    }

    // 4. Record the transition in audit log
    const { error: auditError } = await supabase
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
                ...meta
            }
        });

    if (auditError) {
        throw new Error(
            `Action transitioned but audit logging failed: ${auditError.message}`
        );
    }

    return updated;
}

module.exports = {
    transition,
    VALID_TRANSITIONS
};