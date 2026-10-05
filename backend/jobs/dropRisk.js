// backend/jobs/dropRisk.js
const cron = require('node-cron');
const supabase = require('../superbase');

/**
 * Calculates drop risk score and triggers high-risk notifications.
 */
async function processDropRiskBatch() {
  console.log('[Drop Risk Cron] Running drop risk calculation batch...');
  try {
    const { data: actions, error } = await supabase
      .from('care_actions')
      .select('*, care_journeys(patient_id, patients(age))')
      .in('state', [
        'CREATED',
        'VALIDATED',
        'ASSIGNED',
        'SCHEDULED',
        'BLOCKED'
      ]);

    if (error) {
      console.error('[Drop Risk Cron] Query failed:', error.message);
      return;
    }

    if (!actions || actions.length === 0) {
      console.log('[Drop Risk Cron] No active actions found for risk scoring.');
      return;
    }

    for (const action of actions) {
      // No deadline means time-based risk cannot be calculated
      if (!action.deadline_at) continue;

      const now = Date.now();
      const deadline = new Date(action.deadline_at).getTime();
      const created = new Date(action.created_at).getTime();

      const totalHrs = (deadline - created) / 3600000;
      if (totalHrs <= 0) continue;

      const deadlineHrs = (deadline - now) / 3600000;

      // Percentage of time elapsed (0.0 to 1.0)
      const elapsed = Math.max(
        0,
        Math.min(1, 1 - deadlineHrs / totalHrs)
      );

      // Extract age safely from Supabase relation
      const journey = Array.isArray(action.care_journeys) ? action.care_journeys[0] : action.care_journeys;
      const patient = Array.isArray(journey?.patients) ? journey?.patients[0] : journey?.patients;
      const age = patient?.age ?? 50;

      const ageFactor = age > 60 ? 0.8 : age > 45 ? 0.5 : 0.3;

      // Action type risk mapping
      const typeRiskMap = {
        TEST: 0.4,
        REFERRAL: 0.6,
        MEDICATION: 0.3,
        FOLLOWUP: 0.7,
        REVIEW: 0.5
      };

      const actionRisk = typeRiskMap[action.type] ?? 0.4;

      // Formula: 50% Time Pressure + 30% Age Factor + 20% Action Type Risk
      const score = Math.min(
        1.0,
        elapsed * 0.5 + ageFactor * 0.3 + actionRisk * 0.2
      );

      const roundedScore = parseFloat(score.toFixed(2));

      // Update drop_risk column in database
      const { error: updateError } = await supabase
        .from('care_actions')
        .update({
          drop_risk: roundedScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', action.id);

      if (updateError) {
        console.error(`[Drop Risk Cron] Failed updating drop risk for action ${action.id}:`, updateError.message);
        continue;
      }

      // High-risk threshold (>= 0.70) -> Trigger patient reminder
      if (roundedScore >= 0.70) {
        const message = `Reminder: ${action.description || 'Care action'} needs to be completed soon. High drop risk detected.`;

        const { data: existingNotification } = await supabase
          .from('notifications')
          .select('id')
          .eq('journey_id', action.journey_id)
          .eq('recipient_type', 'Patient')
          .eq('message', message)
          .limit(1);

        if (!existingNotification || existingNotification.length === 0) {
          await supabase.from('notifications').insert({
            journey_id: action.journey_id,
            recipient_type: 'Patient',
            message,
            status: 'SENT',
            meta: {
              action_id: action.id,
              drop_risk: roundedScore,
              risk_threshold: 0.70
            }
          });
        }
      }
    }
    console.log('[Drop Risk Cron] Batch calculation completed successfully.');
  } catch (error) {
    console.error('[Drop Risk Cron] Execution error:', error);
  }
}

// Schedule hourly execution
cron.schedule('0 * * * *', processDropRiskBatch);

console.log('Drop risk cron running');

module.exports = {
  processDropRiskBatch
};