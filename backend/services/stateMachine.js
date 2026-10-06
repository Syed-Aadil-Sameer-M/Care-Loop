const supabase = require('../superbase');

/*
 * ============================================================
 * CARELOOP STATE MACHINE
 * ============================================================
 *
 * This file is the SINGLE AUTHORITY for care-action state
 * transitions.
 *
 * Other services/routes must NEVER directly modify the
 * care_actions.state field.
 *
 * Responsibilities:
 *   - Validate whether a state transition is allowed
 *   - Update the action state
 *   - Record every transition in audit_log
 *
 * ============================================================
 */

const VALID_TRANSITIONS = {
<<<<<<< HEAD
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
=======
    CREATED: [
        'VALIDATED',
        'HELD',
        'BLOCKED'
    ],

    VALIDATED: [
        'ASSIGNED',
        'BLOCKED'
    ],

    HELD: [
        'VALIDATED',
        'REJECTED',
        'BLOCKED'
    ],

    // Rejected actions are terminal.
    REJECTED: [],

    ASSIGNED: [
        'SCHEDULED',
        'ESCALATED'
    ],

    BLOCKED: [
        'VALIDATED'
    ],

    SCHEDULED: [
        'IN_PROGRESS',
        'OVERDUE',
        'ESCALATED'
    ],

    IN_PROGRESS: [
        'COMPLETED',
        'ESCALATED'
    ],

    COMPLETED: [
        'VERIFIED'
    ],

    // Verified actions are terminal.
    VERIFIED: [],

    OVERDUE: [
        'ESCALATED',
        'COMPLETED'
    ],

    ESCALATED: [
        'ASSIGNED',
        'COMPLETED'
    ]
};


/*
 * Valid actors according to the audit_log database constraint.
 */
const VALID_ACTORS = [
    'AGENT',
    'Doctor',
    'Coordinator',
    'Patient',
    'Department',
    'SYSTEM'
];


/*
 * ============================================================
 * TRANSITION
 * ============================================================
 *
 * transition(
 *   actionId,
 *   newState,
 *   actor,
 *   reason,
 *   meta
 * )
 *
 * Returns:
 *   updated action
 *
 * Returns null when the requested transition is not allowed.
 *
 * Throws an error when a database operation fails.
 * ============================================================
 */

async function transition(
    actionId,
    newState,
    actor,
    reason,
    meta = {}
) {
    // --------------------------------------------------------
    // 1. Validate basic input
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // 2. Get current action
    // --------------------------------------------------------

    const { data: action, error: fetchError } = await supabase
        .from('care_actions')
        .select('*')
        .eq('id', actionId)
        .single();
>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93

        if (fetchError) {
            throw new Error(
                `Failed to fetch action ${actionId}: ${fetchError.message}`
            );
        }

        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

<<<<<<< HEAD
        if (options.expectedState && action.state !== options.expectedState) {
            return null;
        }

        // 2. Check whether transition is allowed.
        const allowed = VALID_TRANSITIONS[action.state] || [];
=======

    // --------------------------------------------------------
    // 3. Check whether transition is allowed
    // --------------------------------------------------------

    const allowedTransitions =
        VALID_TRANSITIONS[action.state] || [];

    if (!allowedTransitions.includes(newState)) {
        console.warn(
            `Invalid transition: ${action.state} → ${newState} ` +
            `for action ${actionId}`
        );
>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93

        if (!allowed.includes(newState)) {
            console.warn(
                `Invalid transition: ${action.state} → ${newState} for ${actionId}`
            );

<<<<<<< HEAD
            return null;
        }

        // 3. Update action state with a compare-and-set condition.
        const transitionedAt = new Date().toISOString();
        const { data: updated, error: updateError } = await client
            .from('care_actions')
            .update({
                state: newState,
                updated_at: transitionedAt,
=======

    // --------------------------------------------------------
    // 4. Update action state
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // 5. Record transition in audit log
    // --------------------------------------------------------

    const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
            journey_id: action.journey_id,
            action_id: actionId,
            actor,
            event: `${action.state} → ${newState}`,
            reason: reason || 'State transition',
            meta: {
                previous_state: action.state,
                new_state: newState,
>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93
                ...meta
            })
            .eq('id', actionId)
            .eq('state', action.state)
            .select()
            .maybeSingle();

<<<<<<< HEAD
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
=======
    if (auditError) {
        /*
         * The state has already changed at this point.
         * We throw so the caller knows the audit operation
         * failed and can handle it appropriately.
         */
        throw new Error(
            `Action transitioned but audit logging failed: ` +
            `${auditError.message}`
        );
    }


    // --------------------------------------------------------
    // 6. Return updated action
    // --------------------------------------------------------

    return updated;
}

>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93

module.exports = {
    transition,
    createTransition,
    VALID_TRANSITIONS
};