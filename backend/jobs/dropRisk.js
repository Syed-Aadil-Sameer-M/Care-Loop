const cron = require('node-cron');
const supabase = require('../superbase');

// Run every hour
cron.schedule(
    '0 * * * *',
    async () => {
        try {
            const { data: actions, error } = await supabase
                .from('care_actions')
                .select(
                    '*, care_journeys(patient_id, patients(age))'
                )
                .in('state', [
                    'CREATED',
                    'VALIDATED',
                    'ASSIGNED',
                    'SCHEDULED',
                    'BLOCKED'
                ]);

            if (error) {
                console.error(
                    'Drop risk query failed:',
                    error.message
                );
                return;
            }

            if (!actions || actions.length === 0) {
                return;
            }

            for (const action of actions) {
                // No deadline means we cannot calculate time-based risk
                if (!action.deadline_at) {
                    continue;
                }

                const now = Date.now();
                const deadline = new Date(action.deadline_at).getTime();
                const created = new Date(action.created_at).getTime();

                // Total time available for the action
                const totalHrs =
                    (deadline - created) / 3600000;

                // Protect against invalid deadlines
                if (totalHrs <= 0) {
                    continue;
                }

                // Hours remaining until deadline
                const deadlineHrs =
                    (deadline - now) / 3600000;

                // Percentage of available time already consumed
                const elapsed = Math.max(
                    0,
                    Math.min(
                        1,
                        1 - deadlineHrs / totalHrs
                    )
                );

                // --------------------------------------------------
                // Patient age factor
                // --------------------------------------------------
                const age =
                    action.care_journeys?.patients?.age ?? 50;

                const ageFactor =
                    age > 60
                        ? 0.8
                        : age > 45
                            ? 0.5
                            : 0.3;

                // --------------------------------------------------
                // Action type risk
                // --------------------------------------------------
                const typeRisk = {
                    TEST: 0.4,
                    REFERRAL: 0.6,
                    MEDICATION: 0.3,
                    FOLLOWUP: 0.7,
                    REVIEW: 0.5
                };

                const actionRisk =
                    typeRisk[action.type] ?? 0.4;

                // --------------------------------------------------
                // Final drop-risk score
                //
                // 50% = time pressure
                // 30% = patient age
                // 20% = action type
                // --------------------------------------------------
                const score = Math.min(
                    1,
                    (elapsed * 0.5) +
                    (ageFactor * 0.3) +
                    (actionRisk * 0.2)
                );

                const roundedScore =
                    parseFloat(score.toFixed(2));

                // --------------------------------------------------
                // Save drop risk
                // --------------------------------------------------
                const { error: updateError } =
                    await supabase
                        .from('care_actions')
                        .update({
                            drop_risk: roundedScore,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', action.id);

                if (updateError) {
                    console.error(
                        `Failed updating drop risk for action ${action.id}:`,
                        updateError.message
                    );
                    continue;
                }

                // --------------------------------------------------
                // High-risk notification
                // --------------------------------------------------
                if (roundedScore >= 0.70) {
                    const message =
                        `Reminder: ${action.description} needs to be completed soon. High drop risk detected.`;

                    // Prevent duplicate notifications
                    const {
                        data: existingNotification,
                        error: notificationCheckError
                    } = await supabase
                        .from('notifications')
                        .select('id')
                        .eq('journey_id', action.journey_id)
                        .eq('recipient_type', 'Patient')
                        .eq('message', message)
                        .limit(1);

                    if (notificationCheckError) {
                        console.error(
                            `Failed checking notification for action ${action.id}:`,
                            notificationCheckError.message
                        );
                        continue;
                    }

                    if (
                        !existingNotification ||
                        existingNotification.length === 0
                    ) {
                        const {
                            error: notificationError
                        } = await supabase
                            .from('notifications')
                            .insert({
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

                        if (notificationError) {
                            console.error(
                                `Failed creating notification for action ${action.id}:`,
                                notificationError.message
                            );
                        }
                    }
                }
            }
        } catch (error) {
            console.error(
                'Drop risk cron error:',
                error
            );
        }
    },
    {
        scheduled: true
    }
);

console.log('Drop risk cron running');