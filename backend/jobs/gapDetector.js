const cron = require('node-cron');
const supabase = require('../superbase');
const { transition } = require('../services/stateMachine');

// Every 30 seconds in demo mode, every 5 minutes in production
const schedule =
    process.env.DEMO_MODE === 'true'
        ? '*/30 * * * * *'
        : '*/5 * * * *';

cron.schedule(
    schedule,
    async () => {
        try {
            const { data: actions, error } = await supabase
                .from('care_actions')
                .select('*')
                .in('state', [
                    'CREATED',
                    'SCHEDULED',
                    'COMPLETED'
                ]);

            if (error) {
                console.error(
                    'Gap detector query failed:',
                    error.message
                );
                return;
            }

            if (!actions || actions.length === 0) {
                return;
            }

            for (const action of actions) {
                const ageHrs =
                    (Date.now() - new Date(action.updated_at).getTime()) /
                    3600000;

                // ==================================================
                // GAP 1:
                // Action was created but nothing happened for 2 hours
                // ==================================================
                if (
                    action.state === 'CREATED' &&
                    ageHrs > 2
                ) {
                    // Prevent duplicate GAP_DETECTED audit entries
                    const { data: existingGap, error: gapError } =
                        await supabase
                            .from('audit_log')
                            .select('id')
                            .eq('action_id', action.id)
                            .eq('event', 'GAP_DETECTED')
                            .limit(1);

                    if (gapError) {
                        console.error(
                            `Failed checking existing gap for action ${action.id}:`,
                            gapError.message
                        );
                        continue;
                    }

                    if (!existingGap || existingGap.length === 0) {
                        const { error: auditError } = await supabase
                            .from('audit_log')
                            .insert({
                                journey_id: action.journey_id,
                                action_id: action.id,
                                actor: 'SYSTEM',
                                event: 'GAP_DETECTED',
                                reason: 'NO_SCHEDULE_EVENT — action stale for 2h',
                                meta: {
                                    gap_type: 'NO_SCHEDULE_EVENT',
                                    age_hours: ageHrs
                                }
                            });

                        if (auditError) {
                            console.error(
                                `Failed recording gap for action ${action.id}:`,
                                auditError.message
                            );
                        }
                    }
                }

                // ==================================================
                // GAP 2:
                // Scheduled action has passed its deadline
                // ==================================================
                if (
                    action.state === 'SCHEDULED' &&
                    action.deadline_at &&
                    new Date(action.deadline_at) < new Date()
                ) {
                    const updated = await transition(
                        action.id,
                        'OVERDUE',
                        'SYSTEM',
                        'Deadline passed'
                    );

                    if (!updated) {
                        console.warn(
                            `Unable to transition action ${action.id} ` +
                            'from SCHEDULED to OVERDUE'
                        );
                    }
                }

                // ==================================================
                // GAP 3:
                // Completed result has no REVIEW action after 4 hours
                // ==================================================
                if (
                    action.state === 'COMPLETED' &&
                    ageHrs > 4
                ) {
                    // Find actions that depend on the completed action.
                    //
                    // Example:
                    // REVIEW action ID = action_id
                    // Completed action ID = depends_on_action_id
                    //
                    // Therefore:
                    // depends_on_action_id = completed action.id
                    const {
                        data: dependencies,
                        error: dependencyError
                    } = await supabase
                        .from('action_dependencies')
                        .select('action_id')
                        .eq('depends_on_action_id', action.id);

                    if (dependencyError) {
                        console.error(
                            `Failed checking REVIEW dependency for action ${action.id}:`,
                            dependencyError.message
                        );
                        continue;
                    }

                    let reviewExists = false;

                    if (dependencies && dependencies.length > 0) {
                        const reviewActionIds = dependencies.map(
                            dependency => dependency.action_id
                        );

                        const {
                            data: reviewActions,
                            error: reviewError
                        } = await supabase
                            .from('care_actions')
                            .select('id')
                            .in('id', reviewActionIds)
                            .eq('type', 'REVIEW');

                        if (reviewError) {
                            console.error(
                                `Failed checking REVIEW action for ${action.id}:`,
                                reviewError.message
                            );
                            continue;
                        }

                        reviewExists =
                            reviewActions &&
                            reviewActions.length > 0;
                    }

                    // No REVIEW action was created
                    if (!reviewExists) {
                        const message =
                            `Result pending review for over 4 hours: ${action.description}`;

                        // Prevent duplicate notifications
                        const {
                            data: existingNotification,
                            error: notificationCheckError
                        } = await supabase
                            .from('notifications')
                            .select('id')
                            .eq('journey_id', action.journey_id)
                            .eq('recipient_type', 'Doctor')
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
                                    recipient_type: 'Doctor',
                                    message,
                                    status: 'SENT',
                                    meta: {
                                        action_id: action.id,
                                        gap_type: 'REVIEW_NOT_TRIGGERED',
                                        age_hours: ageHrs
                                    }
                                });

                            if (notificationError) {
                                console.error(
                                    `Failed creating review notification for action ${action.id}:`,
                                    notificationError.message
                                );
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(
                'Gap detector error:',
                error
            );
        }
    },
    {
        scheduled: true
    }
);

console.log('Gap detector running');