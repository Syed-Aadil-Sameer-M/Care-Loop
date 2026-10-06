// backend/services/dependency.js
const { supabase } = require('../superbase');

/**
 * Checks all downstream care actions that depend on a completed/verified action.
 * If all prerequisites for a dependent action are satisfied, it transitions
 * from 'BLOCKED' to 'ASSIGNED'.
 * 
 * @param {string} completedActionId - The UUID of the action that was completed/verified.
 */
async function checkAndUnblockDependents(completedActionId) {
  try {
    console.log(`[Dependency Engine] Checking unblock conditions for completed action: ${completedActionId}`);

    // 1. Fetch all actions where completedActionId is inside their depends_on array
    const { data: dependentActions, error: fetchErr } = await supabase
      .from('care_actions')
      .select('*')
      .contains('depends_on', [completedActionId]);

    if (fetchErr) {
      console.error('[Dependency Engine] Error fetching dependent actions:', fetchErr);
      return { success: false, error: fetchErr.message };
    }

    if (!dependentActions || dependentActions.length === 0) {
      console.log('[Dependency Engine] No downstream actions depend on this action.');
      return { success: true, unblockedCount: 0 };
    }

    const unblockedActions = [];

    // 2. Evaluate each dependent action
    for (const action of dependentActions) {
      if (action.status !== 'BLOCKED') continue;

      const dependsOnList = action.depends_on || [];

      // Fetch status of all prerequisite actions in depends_on
      const { data: prereqActions, error: prereqErr } = await supabase
        .from('care_actions')
        .select('id, status')
        .in('id', dependsOnList);

      if (prereqErr) {
        console.error(`[Dependency Engine] Error checking prereqs for action ${action.id}:`, prereqErr);
        continue;
      }

      // 3. Verify if EVERY prerequisite is either COMPLETED or VERIFIED
      const allSatisfied = prereqActions.every(prereq => 
        ['COMPLETED', 'VERIFIED'].includes(prereq.status)
      );

      // 4. If all prerequisites are satisfied, unblock the downstream action
      if (allSatisfied && prereqActions.length === dependsOnList.length) {
        const { data: updatedAction, error: updateErr } = await supabase
          .from('care_actions')
          .update({ 
            status: 'ASSIGNED',
            updated_at: new Date().toISOString()
          })
          .eq('id', action.id)
          .select()
          .single();

        if (!updateErr && updatedAction) {
          unblockedActions.push(updatedAction);
          console.log(`[Dependency Engine] Action ${action.id} unblocked! BLOCKED -> ASSIGNED`);

          // 5. Log audit trail entry
          await supabase.from('audit_logs').insert({
            journey_id: action.journey_id,
            action_id: action.id,
            actor: 'CARELOOP_DEPENDENCY_ENGINE',
            event_type: 'STATE_TRANSITION',
            details: `Action unblocked and transitioned from BLOCKED to ASSIGNED following completion of dependency ${completedActionId}`
          });
        }
      }
    }

    return {
      success: true,
      unblockedCount: unblockedActions.length,
      unblockedActions
    };
  } catch (err) {
    console.error('[Dependency Engine] Unhandled error in checkAndUnblockDependents:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  checkAndUnblockDependents
};