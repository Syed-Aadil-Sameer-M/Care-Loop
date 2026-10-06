const supabase = require('../superbase');
const { transition } = require('./stateMachine');

function getBackendBaseUrl() {
    const configuredUrl =
        process.env.BACKEND_URL ||
        process.env.API_BASE_URL ||
        process.env.VITE_API_BASE_URL ||
        `http://localhost:${Number(process.env.PORT) || 3001}`;

    return configuredUrl.replace(/\/$/, '');
}

function createExecutor({
    client = supabase,
    transitionAction = transition,
    selfHealAction
} = {}) {
    const handleFailure =
        selfHealAction ||
        ((action, error) => require('./selfheal').selfHeal(action, error));

    async function executeAction(action) {
        if (!action || !action.id) {
            throw new Error('Action is required');
        }

        const { data: deps, error: dependencyError } = await client
            .from('action_dependencies')
            .select('depends_on_action_id')
            .eq('action_id', action.id);

        if (dependencyError) {
            throw new Error(
                `Failed to load dependencies for action ${action.id}: ${dependencyError.message}`
            );
        }

        if (deps && deps.length > 0) {
            const depIds = deps.map((entry) => entry.depends_on_action_id);
            const { data: depActions, error: dependencyActionError } = await client
                .from('care_actions')
                .select('state')
                .in('id', depIds);

            if (dependencyActionError) {
                throw new Error(
                    `Failed to load prerequisite actions for ${action.id}: ${dependencyActionError.message}`
                );
            }

            if (!Array.isArray(depActions) || depActions.length !== depIds.length) {
                throw new Error(
                    `Could not verify every prerequisite for action ${action.id}`
                );
            }

            const allComplete = depActions.every(
                (dependencyAction) =>
                    dependencyAction.state === 'COMPLETED' ||
                    dependencyAction.state === 'VERIFIED'
            );

            if (!allComplete) {
                const blocked = await transitionAction(
                    action.id,
                    'BLOCKED',
                    'SYSTEM',
                    'Waiting on dependencies'
                );

                if (!blocked) {
                    throw new Error(
                        `Unable to block action ${action.id} while prerequisites remain incomplete`
                    );
                }

                return;
            }
        }

        if ((action.state || 'VALIDATED') !== 'ASSIGNED') {
            const assigned = await transitionAction(
                action.id,
                'ASSIGNED',
                'AGENT',
                'Routing to department'
            );

            if (!assigned) {
                throw new Error(`Unable to assign action ${action.id} for execution`);
            }
        }

        try {
            const mockAPIs = {
                TEST: () => callMockAPI('/api/mock/lab/book', action),
                REFERRAL: () => callMockAPI('/api/mock/referral/send', action),
                MEDICATION: () => callMockAPI('/api/mock/pharmacy/log', action),
                FOLLOWUP: () => callMockAPI('/api/mock/clinic/book', action),
                REVIEW: () => notifyDoctorForReview(action)
            };

            const result = await (mockAPIs[action.type] || mockAPIs.TEST)();
            await transitionAction(
                action.id,
                'SCHEDULED',
                'AGENT',
                'Slot confirmed',
                { scheduled_slot: result && result.slot }
            );

            await unblockDependents(action.id);
        } catch (error) {
            await handleFailure(action, error);
        }
    }

    async function callMockAPI(path, action) {
        const baseUrl = getBackendBaseUrl();
        const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action_id: action.id,
                department: action.department
            })
        });

        if (!response.ok) {
            throw new Error(`Mock API failed: ${path}`);
        }

        return response.json();
    }

    async function unblockDependents(completedActionId) {
        const { data: blocked, error: dependentError } = await client
            .from('action_dependencies')
            .select('action_id')
            .eq('depends_on_action_id', completedActionId);

        if (dependentError) {
            throw new Error(
                `Failed to load dependent actions for ${completedActionId}: ${dependentError.message}`
            );
        }

        for (const { action_id } of blocked || []) {
            const { data: dependentAction, error: actionError } = await client
                .from('care_actions')
                .select('*')
                .eq('id', action_id)
                .single();

            if (actionError) {
                throw new Error(
                    `Failed to load dependent action ${action_id}: ${actionError.message}`
                );
            }

            if (dependentAction && dependentAction.state === 'BLOCKED') {
                const validated = await transitionAction(
                    action_id,
                    'VALIDATED',
                    'SYSTEM',
                    'Dependency resolved'
                );

                if (!validated) {
                    throw new Error(
                        `Unable to validate dependent action ${action_id}`
                    );
                }

                await executeAction(validated);
            }
        }
    }

    async function notifyDoctorForReview(action) {
        await client.from('notifications').insert({
            journey_id: action.journey_id,
            recipient_type: 'Doctor',
            message: `Results ready for review: ${action.description}`,
            status: 'SENT'
        });

        return { slot: 'Doctor notified' };
    }

    return { executeAction, unblockDependents };
}

const { executeAction, unblockDependents } = createExecutor();

module.exports = { executeAction, unblockDependents, createExecutor };