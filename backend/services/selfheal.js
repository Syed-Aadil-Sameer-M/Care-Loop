const supabase = require('../superbase');
const { transition } = require('./stateMachine');
const { analyzeFailure } = require('./groq');

const MAX_RETRIES = 3;

async function selfHeal(action, error) {
    if (!action || !action.id) {
        throw new Error('selfHeal requires a valid action');
    }

    const newCount = (action.retry_count || 0) + 1;

    // ---------------------------------------------------------
    // 1. Ask Groq to analyze and explain the failure
    // ---------------------------------------------------------
    let failureAnalysis = null;

    try {
        failureAnalysis = await analyzeFailure(action, error);
    } catch (analysisError) {
        // AI analysis must never prevent deterministic recovery.
        console.error(
            `Groq failure analysis failed for action ${action.id}:`,
            analysisError
        );

        failureAnalysis = {
            failure_type: 'UNKNOWN',
            severity: 'UNKNOWN',
            explanation: error.message,
            recommended_action: 'FOLLOW_STANDARD_RETRY_POLICY'
        };
    }

    // ---------------------------------------------------------
    // 2. Update retry count
    // ---------------------------------------------------------
    const { error: updateError } = await supabase
        .from('care_actions')
        .update({
            retry_count: newCount
        })
        .eq('id', action.id);

    if (updateError) {
        throw new Error(
            `Failed to update retry count: ${updateError.message}`
        );
    }

    // ---------------------------------------------------------
    // 3. Write failure/retry information to audit log
    // ---------------------------------------------------------
    const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
            journey_id: action.journey_id,
            action_id: action.id,
            actor: 'AGENT',
            event: 'RETRY',
            reason: `Attempt ${newCount}: ${error.message}`,
            meta: {
                attempt: newCount,
                failure_type: failureAnalysis.failure_type,
                severity: failureAnalysis.severity,
                explanation: failureAnalysis.explanation,
                recommended_action: failureAnalysis.recommended_action,
                original_error: error.message
            }
        });

    if (auditError) {
        throw new Error(
            `Failed to write self-healing audit log: ${auditError.message}`
        );
    }

    // ---------------------------------------------------------
    // 4. Retry if attempts remain
    // ---------------------------------------------------------
    if (newCount < MAX_RETRIES) {
        const delay = Math.pow(2, newCount) * 5000;

        console.log(
            `Retrying action ${action.id} in ${delay}ms ` +
            `(attempt ${newCount}/${MAX_RETRIES})`
        );

        setTimeout(async () => {
            try {
                const { data: fresh, error: fetchError } = await supabase
                    .from('care_actions')
                    .select('*')
                    .eq('id', action.id)
                    .single();

                if (fetchError) {
                    throw new Error(
                        `Failed to reload action: ${fetchError.message}`
                    );
                }

                if (!fresh) {
                    throw new Error(
                        `Action ${action.id} no longer exists`
                    );
                }

                const { executeAction } = require('./executor');

                await executeAction(fresh);

            } catch (retryError) {
                console.error(
                    `Retry attempt failed for action ${action.id}:`,
                    retryError
                );

                // executeAction() is responsible for calling selfHeal()
                // again when the retry itself fails.
            }
        }, delay);

        return;
    }

    // ---------------------------------------------------------
    // 5. Maximum retries exhausted → escalate
    // ---------------------------------------------------------
    await transition(
        action.id,
        'ESCALATED',
        'AGENT',
        'Max retries exhausted',
        {
            retry_count: newCount,
            failure_type: failureAnalysis.failure_type,
            failure_severity: failureAnalysis.severity
        }
    );

    // ---------------------------------------------------------
    // 6. Notify coordinator with AI-generated explanation
    // ---------------------------------------------------------
    const notificationMessage =
        `Action requires manual resolution: ${action.description}. ` +
        `Failed after ${MAX_RETRIES} attempts. ` +
        `Failure type: ${failureAnalysis.failure_type}. ` +
        `Severity: ${failureAnalysis.severity}. ` +
        `Explanation: ${failureAnalysis.explanation}`;

    const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
            journey_id: action.journey_id,
            recipient_type: 'Coordinator',
            message: notificationMessage,
            status: 'SENT'
        });

    if (notificationError) {
        console.error(
            `Failed to create escalation notification for action ${action.id}:`,
            notificationError
        );
    }
}

module.exports = {
    selfHeal,
    MAX_RETRIES
};