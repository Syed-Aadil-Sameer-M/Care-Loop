const { detectAnomaly } = require('./groq');
const supabase = require('../superbase');

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'NONE'];
const VALID_DEPARTMENTS = [
    'Lab',
    'Cardiology',
    'Pharmacy',
    'Clinic',
    'Emergency'
];

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
 * - Newly generated anomaly actions start in HELD so a doctor
 *   can review them before execution.
 *
 * Supabase dependency direction:
 *   anomaly action (action_id)
 *          ↓
 *   triggering/completed action (depends_on_action_id)
 *
 * ============================================================
 */

async function checkPlanAnomaly(journeyId, actionId, resultText) {
    if (typeof journeyId !== 'string' || !UUID_REGEX.test(journeyId)) {
        throw new Error('journeyId must be a valid UUID');
    }

    if (typeof actionId !== 'string' || !UUID_REGEX.test(actionId)) {
        throw new Error('actionId must be a valid UUID');
    }

    if (typeof resultText !== 'string' || !resultText.trim()) {
        throw new Error('resultText must be a non-empty string');
    }

    const { data: journey, error: journeyError } = await supabase
        .from('care_journeys')
        .select('id')
        .eq('id', journeyId)
        .eq('status', 'ACTIVE')
        .maybeSingle();

    if (journeyError) {
        throw new Error(
            `Failed to load active care plan journey: ${journeyError.message}`
        );
    }

    if (!journey) {
        throw new Error(`Active journey ${journeyId} was not found`);
    }

    // ------------------------------------------------------------
    // 1. Load the journey's care actions
    // ------------------------------------------------------------
    const { data: actions, error: actionsError } = await supabase
        .from('care_actions')
        .select('id, type, description, state, department, result_text, meta')
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

    const triggeringAction = actions.find(
        (action) => action.id === actionId
    );

    if (
        !triggeringAction ||
        !['COMPLETED', 'VERIFIED'].includes(triggeringAction.state) ||
        typeof triggeringAction.result_text !== 'string' ||
        triggeringAction.result_text.trim() !== resultText.trim()
    ) {
        throw new Error(
            `Action ${actionId} has no matching completed result in journey ${journeyId}`
        );
    }

    const completedAnalysis =
        triggeringAction.meta?.anomaly_processing;

    if (
        completedAnalysis?.result_text === resultText.trim() &&
        completedAnalysis.analysis
    ) {
        validateAnalysis(completedAnalysis.analysis);
        return completedAnalysis.analysis;
    }

    const { data: existingAnomalyAction, error: existingActionError } =
        await supabase
            .from('care_actions')
            .select('id, meta')
            .eq('journey_id', journeyId)
            .eq('type', 'REFERRAL')
            .filter('meta->>triggered_by', 'eq', actionId)
            .maybeSingle();

    if (existingActionError) {
        throw new Error(
            `Failed to check for an existing anomaly action: ${existingActionError.message}`
        );
    }

    // Keep only the care-plan fields needed for the comparison.
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
    let analysis;
    let newAction = existingAnomalyAction;

    if (existingAnomalyAction) {
        const storedAnalysis =
            existingAnomalyAction.meta?.anomaly &&
            typeof existingAnomalyAction.meta.anomaly === 'object'
                ? existingAnomalyAction.meta.anomaly
                : existingAnomalyAction.meta;

        analysis = {
            anomaly_detected: true,
            finding: storedAnalysis?.finding,
            reason: storedAnalysis?.reason,
            severity: storedAnalysis?.severity,
            suggested_action:
                storedAnalysis?.suggested_action ||
                existingAnomalyAction.description,
            suggested_department:
                storedAnalysis?.suggested_department ||
                existingAnomalyAction.department
        };
    } else {
        analysis = await detectAnomaly(planJSON, resultText);
    }

    validateAnalysis(analysis);

    // No anomaly — nothing else needs to be created.
    if (!analysis.anomaly_detected) {
        await markAnomalyProcessingComplete(
            triggeringAction,
            resultText,
            analysis
        );
        return analysis;
    }

    // ------------------------------------------------------------
    // 4. Create the suggested referral in HELD state
    // ------------------------------------------------------------
    //
    // HELD is intentional:
    // the anomaly recommendation must be reviewed before
    // becoming part of the executable care workflow.
    //
    if (!newAction) {
        const { data: createdAction, error: actionError } =
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
                        anomaly: true,
                        anomaly_detected: true,
                        triggered_by: actionId,
                        severity: analysis.severity,
                        finding: analysis.finding,
                        reason: analysis.reason,
                        suggested_action: analysis.suggested_action,
                        suggested_department: analysis.suggested_department
                    }
                })
                .select()
                .single();

        if (actionError || !createdAction) {
            throw new Error(
                `Failed to create anomaly action: ${actionError?.message || 'Unknown error'
                }`
            );
        }

        newAction = createdAction;
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
    const { data: existingDependency, error: dependencyLookupError } =
        await supabase
            .from('action_dependencies')
            .select('action_id')
            .eq('action_id', newAction.id)
            .eq('depends_on_action_id', actionId)
            .maybeSingle();

    if (dependencyLookupError) {
        throw new Error(
            `Failed to check anomaly dependency: ${dependencyLookupError.message}`
        );
    }

    if (!existingDependency) {
        const { error: dependencyError } = await supabase
            .from('action_dependencies')
            .insert({
                action_id: newAction.id,
                depends_on_action_id: actionId
            });

        if (dependencyError) {
            throw new Error(
                `Anomaly action ${newAction.id} was created, but its triggering dependency could not be saved: ${dependencyError.message}`
            );
        }
    }

    // ------------------------------------------------------------
    // 6. Notify the doctor
    // ------------------------------------------------------------
    const { data: existingNotification, error: notificationLookupError } =
        await supabase
            .from('notifications')
            .select('id')
            .eq('journey_id', journeyId)
            .eq('recipient_type', 'Doctor')
            .filter('meta->>action_id', 'eq', newAction.id)
            .filter('meta->>triggering_action_id', 'eq', actionId)
            .maybeSingle();

    if (notificationLookupError) {
        throw new Error(
            `Failed to check anomaly notification: ${notificationLookupError.message}`
        );
    }

    if (!existingNotification) {
        const { error: notificationError } = await supabase
            .from('notifications')
            .insert({
                journey_id: journeyId,
                recipient_type: 'Doctor',
                message:
                    `Anomaly detected (${analysis.severity}): ${analysis.finding}. ` +
                    `Reason: ${analysis.reason}. Suggested: ${analysis.suggested_action}. ` +
                    `Action ${newAction.id} is HELD for Doctor confirmation.`,
                status: 'SENT',
                meta: {
                    action_id: newAction.id,
                    triggering_action_id: actionId,
                    anomaly: true
                }
            });

        if (notificationError) {
            throw new Error(
                `Anomaly action ${newAction.id} was created, but the Doctor notification could not be saved: ${notificationError.message}`
            );
        }
    }

    // ------------------------------------------------------------
    // 7. Record the anomaly in the audit log
    // ------------------------------------------------------------
    const { data: existingAudit, error: auditLookupError } = await supabase
        .from('audit_log')
        .select('id')
        .eq('journey_id', journeyId)
        .eq('action_id', actionId)
        .eq('event', 'ANOMALY_DETECTED')
        .filter('meta->>generated_action_id', 'eq', newAction.id)
        .maybeSingle();

    if (auditLookupError) {
        throw new Error(
            `Failed to check anomaly audit record: ${auditLookupError.message}`
        );
    }

    if (!existingAudit) {
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
            throw new Error(
                `Anomaly action ${newAction.id} was created, but the audit entry could not be saved: ${auditError.message}`
            );
        }
    }

    const completedResult = {
        ...analysis,
        generated_action_id: newAction.id
    };

    await markAnomalyProcessingComplete(
        triggeringAction,
        resultText,
        completedResult
    );

    return completedResult;
}

async function markAnomalyProcessingComplete(action, resultText, analysis) {
    const { error } = await supabase
        .from('care_actions')
        .update({
            meta: {
                ...(action.meta || {}),
                anomaly_processing: {
                    result_text: resultText.trim(),
                    analysis
                }
            }
        })
        .eq('id', action.id);

    if (error) {
        throw new Error(
            `Anomaly processing succeeded but completion metadata could not be saved: ${error.message}`
        );
    }
}

function validateAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
        throw new Error('Groq returned an invalid anomaly response object');
    }

    if (typeof analysis.anomaly_detected !== 'boolean') {
        throw new Error('Groq anomaly response anomaly_detected must be a boolean');
    }

    if (typeof analysis.finding !== 'string') {
        throw new Error('Groq anomaly response finding must be a string');
    }

    if (typeof analysis.reason !== 'string') {
        throw new Error('Groq anomaly response reason must be a string');
    }

    if (!VALID_SEVERITIES.includes(analysis.severity)) {
        throw new Error(`Invalid anomaly severity: ${analysis.severity}`);
    }

    if (typeof analysis.suggested_action !== 'string') {
        throw new Error('Groq anomaly response suggested_action must be a string');
    }

    if (!VALID_DEPARTMENTS.includes(analysis.suggested_department)) {
        throw new Error(
            `Invalid anomaly department: ${analysis.suggested_department}`
        );
    }

    if (analysis.anomaly_detected && !analysis.suggested_action.trim()) {
        throw new Error(
            'Groq anomaly response is missing suggested_action'
        );
    }
}

module.exports = {
    checkPlanAnomaly
};