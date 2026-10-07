const supabase = require('../superbase');
const { transition } = require('./stateMachine');
const { selfHeal } = require('./selfheal');

async function executeAction(action) {
    // Check dependencies first
    const { data: deps } = await supabase
        .from('action_dependencies')
        .select('depends_on_action_id')
        .eq('action_id', action.id);

    if (deps && deps.length > 0) {
        const depIds = deps.map(d => d.depends_on_action_id);
        const { data: depActions } = await supabase
            .from('care_actions').select('state').in('id', depIds);

        const allComplete = depActions.every(d => d.state === 'COMPLETED' || d.state === 'VERIFIED');
        if (!allComplete) {
            await transition(action.id, 'BLOCKED', 'SYSTEM', 'Waiting on dependencies');
            return;
        }
    }

    await transition(action.id, 'ASSIGNED', 'AGENT', 'Routing to department');

    try {
        const mockAPIs = {
            TEST: () => callMockAPI('/api/mock/lab/book', action),
            REFERRAL: () => callMockAPI('/api/mock/referral/send', action),
            MEDICATION: () => callMockAPI('/api/mock/pharmacy/log', action),
            FOLLOWUP: () => callMockAPI('/api/mock/clinic/book', action),
            REVIEW: () => notifyDoctorForReview(action)
        };

        const result = await (mockAPIs[action.type] || mockAPIs['TEST'])();
        await transition(action.id, 'SCHEDULED', 'AGENT', 'Slot confirmed',
            { scheduled_slot: result.slot });

        // Unblock anything waiting on this action
        await unblockDependents(action.id);

    } catch (err) {
        await selfHeal(action, err);
    }
}

async function callMockAPI(path, action) {
    // Internal call — same express server
    const res = await fetch(`http://localhost:3001${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, department: action.department })
    });
    if (!res.ok) throw new Error(`Mock API failed: ${path}`);
    return res.json();
}

async function unblockDependents(completedActionId) {
    const { data: blocked } = await supabase
        .from('action_dependencies')
        .select('action_id')
        .eq('depends_on_action_id', completedActionId);

    for (const { action_id } of (blocked || [])) {
        const { data: action } = await supabase
            .from('care_actions').select('*').eq('id', action_id).single();
        if (action && action.state === 'BLOCKED') {
            await transition(action_id, 'VALIDATED', 'SYSTEM', 'Dependency resolved');
            await executeAction(action);
        }
    }
}

async function notifyDoctorForReview(action) {
    await supabase.from('notifications').insert({
        journey_id: action.journey_id,
        recipient_type: 'Doctor',
        message: `Results ready for review: ${action.description}`,
        status: 'SENT'
    });
    return { slot: 'Doctor notified' };
}

module.exports = { executeAction, unblockDependents };