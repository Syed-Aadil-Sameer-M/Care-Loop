const { detectAnomaly } = require('./groq');
const supabase = require('../supabase');

/*
 * ============================================================
 * SUMANTH — ANOMALY DETECTION FEATURE
 * ============================================================
 *
 * This service connects Groq anomaly detection with the
 * CareLoop database workflow.
 *
 * GROQ ANOMALY CONTRACT:
 *   anomaly_detected
 *   finding
 *   reason
 *   severity
 *   suggested_action
 *   suggested_department
 *
 * IMPORTANT:
 * - Groq only ANALYZES the anomaly and suggests an action.
 * - This file is responsible for creating the care action,
 *   dependency, notification, and audit record.
 * - Newly generated anomaly actions start in HELD so that a
 *   doctor/coordinator can review them before execution.
 *
 * Supabase dependency direction:
 *   anomaly action (action_id)
 *          ↓
 *   triggering/completed action (depends_on_action_id)
 *
 * ============================================================
 */

async function checkPlanAnomaly(journeyId, actionId, resultText) {
    if (!journeyId) {
        throw new Error('journeyId is required');
    }

    if (!actionId) {
        throw new Error('actionId is required');
    }

    if (!resultText || typeof resultText !== 'string') {
        throw new Error('resultText is required');
    }

    // ------------------------------------------------------------
    // 1. Get the complete care plan for this journey
    // ------------------------------------------------------------
    const { data: actions, error: actionsError } = await supabase
        .from('care_actions')
        .select('*')
        .eq('journey_id', journeyId);

    if (actionsError) {
        throw new Error(
            `Failed to load care plan: ${actionsError.message}`
        );
    }

    if (!actions || actions.length === 0) {
        throw new Error(
            `No care actions found for journey ${journeyId}`
        );
    }

    // Keep only the information Groq needs for anomaly detection.
    const planJSON = JSON.stringify(
        actions.map((action) => ({
            type: action.type,
            description: action.description,
            state: action.state,
            department: action.department
        }))
    );

    // ------------------------------------------------------------
    // 2. Ask Groq to analyze the reported result
    // ------------------------------------------------------------
    //
    // detectAnomaly() must return the standardized fields:
    //
    // anomaly_detected
    // finding
    // reason
    // severity
    // suggested_action
    // suggested_department
    //
    const analysis = await detectAnomaly(
        planJSON,
        resultText
    );

    // No anomaly — nothing else needs to be created.
    if (!analysis.anomaly_detected) {
        return analysis;
    }

    // ------------------------------------------------------------
    // 3. Validate the suggested department
    // ------------------------------------------------------------
    // These values match the care_actions.department CHECK
    // constraint in Supabase.
    const validDepartments = [
        'Lab',
        'Cardiology',
        'Pharmacy',
        'Clinic',
        'Emergency'
    ];

    if (
        !validDepartments.includes(
            analysis.suggested_department
        )
    ) {
        throw new Error(
            `Invalid anomaly department: ${analysis.suggested_department}`
        );
    }

    if (
        !analysis.suggested_action ||
        typeof analysis.suggested_action !== 'string'
    ) {
        throw new Error(
            'Groq anomaly response is missing suggested_action'
        );
    }

    // ------------------------------------------------------------
    // 4. Create the suggested referral in HELD state
    // ------------------------------------------------------------
    //
    // HELD is intentional:
    // the anomaly recommendation must be reviewed before
    // becoming part of the executable care workflow.
    //
    const { data: newAction, error: actionError } =
        await supabase
            .from('care_actions')
            .insert({
                journey_id: journeyId,
                type: 'REFERRAL',
                description: analysis.suggested_action,
                category: 'Explicit',
                confidence: 0.99,
                department: analysis.suggested_department,
                state: 'HELD',
                meta: {
                    anomaly: analysis,
                    triggered_by: actionId
                }
            })
            .select()
            .single();

    if (actionError || !newAction) {
        throw new Error(
            `Failed to create anomaly action: ${actionError?.message || 'Unknown error'
            }`
        );
    }

    // ------------------------------------------------------------
    // 5. Link the anomaly action to the action that triggered it
    // ------------------------------------------------------------
    //
    // This makes the relationship explicit:
    //
    // new anomaly referral
    //        depends on
    // completed/result action
    //
    const { error: dependencyError } = await supabase
        .from('action_dependencies')
        .insert({
            action_id: newAction.id,
            depends_on_action_id: actionId
        });

    if (dependencyError) {
        console.error(
            `Failed to create anomaly dependency: ${dependencyError.message}`
        );
    }

    // ------------------------------------------------------------
    // 6. Notify the doctor
    // ------------------------------------------------------------
    const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
            journey_id: journeyId,
            recipient_type: 'Doctor',
            message:
                `⚠️ Anomaly detected: ${analysis.finding}. ` +
                `Suggested: ${analysis.suggested_action}. Confirm?`,
            status: 'SENT',
            meta: {
                action_id: newAction.id,
                triggering_action_id: actionId,
                severity: analysis.severity,
                reason: analysis.reason
            }
        });

    if (notificationError) {
        console.error(
            `Failed to create anomaly notification: ${notificationError.message}`
        );
    }

    // ------------------------------------------------------------
    // 7. Record the anomaly in the audit log
    // ------------------------------------------------------------
    const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
            journey_id: journeyId,
            action_id: actionId,
            actor: 'SYSTEM',
            event: 'ANOMALY_DETECTED',
            reason: analysis.reason,
            meta: {
                ...analysis,
                generated_action_id: newAction.id
            }
        });

    if (auditError) {
        console.error(
            `Failed to create anomaly audit entry: ${auditError.message}`
        );
    }

    return {
        ...analysis,
        generated_action_id: newAction.id
    };
}

module.exports = {
    checkPlanAnomaly
};