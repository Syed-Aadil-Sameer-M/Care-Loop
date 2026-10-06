const express = require('express');

const router = express.Router();

const supabase = require('../supabase');
const { transition } = require('../services/stateMachine');
const { extractCareActions } = require('../services/groq');
const { executeAction } = require('../services/executor');

const CONFIDENCE_THRESHOLD = 0.85;

// POST /api/journeys
// Doctor submits a clinical note
router.post('/', async (req, res) => {
    try {
        const { patient_id, note_text } = req.body;

        // ---------------------------------------------------------
        // 1. Validate request
        // ---------------------------------------------------------

        if (!patient_id) {
            return res.status(400).json({
                error: 'patient_id is required'
            });
        }

        if (
            !note_text ||
            typeof note_text !== 'string' ||
            !note_text.trim()
        ) {
            return res.status(400).json({
                error: 'note_text is required'
            });
        }

        // ---------------------------------------------------------
        // 2. Create the care journey
        // ---------------------------------------------------------

        const { data: journey, error: journeyError } = await supabase
            .from('care_journeys')
            .insert({
                patient_id,
                note_text: note_text.trim(),
                status: 'ACTIVE'
            })
            .select()
            .single();

        if (journeyError) {
            throw new Error(
                `Failed to create journey: ${journeyError.message}`
            );
        }

        // ---------------------------------------------------------
        // 3. Extract care actions using Groq
        // ---------------------------------------------------------

        const extracted = await extractCareActions(note_text.trim());

        if (!Array.isArray(extracted)) {
            throw new Error(
                'Care-action extraction returned an invalid result'
            );
        }

        // ---------------------------------------------------------
        // 4. Create every action in CREATED state first
        // ---------------------------------------------------------

        const savedActions = [];

        for (const action of extracted) {
            const deadline_at = action.deadline_days !== null &&
                action.deadline_days !== undefined
                ? new Date(
                    Date.now() +
                    action.deadline_days * 24 * 60 * 60 * 1000
                ).toISOString()
                : null;

            const { data: saved, error: actionError } = await supabase
                .from('care_actions')
                .insert({
                    journey_id: journey.id,
                    type: action.type,
                    description: action.description,
                    category: action.category,
                    confidence: action.confidence,
                    department: action.department,
                    deadline_at,
                    state: 'CREATED'
                })
                .select()
                .single();

            if (actionError) {
                throw new Error(
                    `Failed to save action "${action.description}": ${actionError.message}`
                );
            }

            // -------------------------------------------------------
            // 5. Apply confidence gate through state machine
            // -------------------------------------------------------

            const targetState =
                action.confidence >= CONFIDENCE_THRESHOLD
                    ? 'VALIDATED'
                    : 'HELD';

            const transitioned = await transition(
                saved.id,
                targetState,
                'SYSTEM',
                `Confidence ${action.confidence} ${action.confidence >= CONFIDENCE_THRESHOLD
                    ? 'meets'
                    : 'does not meet'
                } threshold ${CONFIDENCE_THRESHOLD}`
            );

            if (!transitioned) {
                throw new Error(
                    `Unable to transition action ${saved.id} to ${targetState}`
                );
            }

            savedActions.push({
                ...transitioned,
                depends_on: action.depends_on || []
            });
        }

        // ---------------------------------------------------------
        // 6. Wire dependencies
        // ---------------------------------------------------------

        for (const action of savedActions) {
            if (!action.depends_on?.length) {
                continue;
            }

            for (const dependencyDescription of action.depends_on) {
                const dependency = savedActions.find(
                    (candidate) =>
                        candidate.description === dependencyDescription
                );

                if (!dependency) {
                    console.warn(
                        `Dependency "${dependencyDescription}" not found for action "${action.description}"`
                    );

                    continue;
                }

                const { error: dependencyError } = await supabase
                    .from('action_dependencies')
                    .insert({
                        action_id: action.id,
                        depends_on_action_id: dependency.id
                    });

                if (dependencyError) {
                    throw new Error(
                        `Failed to create dependency for "${action.description}": ${dependencyError.message}`
                    );
                }
            }
        }

        // ---------------------------------------------------------
        // 7. Execute validated actions asynchronously
        // ---------------------------------------------------------

        const validatedActions = savedActions.filter(
            (action) => action.state === 'VALIDATED'
        );

        for (const action of validatedActions) {
            executeAction(action).catch((error) => {
                console.error(
                    `Execution failed for action ${action.id}:`,
                    error
                );
            });
        }

        // ---------------------------------------------------------
        // 8. Return journey + actions
        // ---------------------------------------------------------

        return res.status(201).json({
            journey,
            actions: savedActions
        });

    } catch (error) {
        console.error('POST /api/journeys failed:', error);

        return res.status(500).json({
            error: error.message
        });
    }
});


// GET /api/journeys/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: journey, error: journeyError } = await supabase
            .from('care_journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (journeyError) {
            return res.status(404).json({
                error: `Journey not found: ${journeyError.message}`
            });
        }

        const { data: actions, error: actionsError } = await supabase
            .from('care_actions')
            .select('*')
            .eq('journey_id', id)
            .order('created_at', { ascending: true });

        if (actionsError) {
            throw new Error(
                `Failed to load actions: ${actionsError.message}`
            );
        }

        const actionIds = (actions || []).map(
            (action) => action.id
        );

        let dependencies = [];

        if (actionIds.length > 0) {
            const { data: deps, error: depsError } = await supabase
                .from('action_dependencies')
                .select('*')
                .in('action_id', actionIds);

            if (depsError) {
                throw new Error(
                    `Failed to load dependencies: ${depsError.message}`
                );
            }

            dependencies = deps || [];
        }

        return res.json({
            journey,
            actions: actions || [],
            dependencies
        });

    } catch (error) {
        console.error(
            `GET /api/journeys/${req.params.id} failed:`,
            error
        );

        return res.status(500).json({
            error: error.message
        });
    }
});


// GET /api/journeys
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('care_journeys')
            .select(`
        *,
        patients(name, age)
      `)
            .order('created_at', {
                ascending: false
            });

        if (error) {
            throw new Error(
                `Failed to load journeys: ${error.message}`
            );
        }

        return res.json(data || []);

    } catch (error) {
        console.error(
            'GET /api/journeys failed:',
            error
        );

        return res.status(500).json({
            error: error.message
        });
    }
});

module.exports = router;