const supabase = require('../superbase');

async function checkAndUnblockDependents(completedActionId) {
    const { data: rows, error } = await supabase
        .from('action_dependencies')
        .select('action_id')
        .eq('depends_on_action_id', completedActionId);

    if (error) {
        throw new Error(
            `Failed to load dependent actions for ${completedActionId}: ${error.message}`
        );
    }

    for (const row of rows || []) {
        const { data: dependentAction, error: actionError } = await supabase
            .from('care_actions')
            .select('*')
            .eq('id', row.action_id)
            .single();

        if (actionError) {
            throw new Error(
                `Failed to load dependent action ${row.action_id}: ${actionError.message}`
            );
        }

        if (!dependentAction || dependentAction.state !== 'BLOCKED') {
            continue;
        }

        const dependsOnIds = Array.isArray(dependentAction.depends_on)
            ? dependentAction.depends_on
            : [];

        if (dependsOnIds.length === 0) {
            continue;
        }

        const { data: prereqs, error: prereqError } = await supabase
            .from('care_actions')
            .select('id, state')
            .in('id', dependsOnIds);

        if (prereqError) {
            throw new Error(
                `Failed to verify prerequisites for ${row.action_id}: ${prereqError.message}`
            );
        }

        const satisfied = (prereqs || []).every(
            (prereq) => prereq.state === 'COMPLETED' || prereq.state === 'VERIFIED'
        );

        if (satisfied && (prereqs || []).length === dependsOnIds.length) {
            const { data: updatedAction, error: updateError } = await supabase
                .from('care_actions')
                .update({
                    state: 'VALIDATED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', row.action_id)
                .select()
                .single();

            if (updateError) {
                throw new Error(
                    `Failed to unblock dependent action ${row.action_id}: ${updateError.message}`
                );
            }

            if (updatedAction) {
                return updatedAction;
            }
        }
    }

    return null;
}

module.exports = {
    checkAndUnblockDependents
};