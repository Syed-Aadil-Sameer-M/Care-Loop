const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const EXTRACTION_SCHEMA = {
    type: 'object',
    properties: {
        actions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: [
                            'TEST',
                            'REFERRAL',
                            'MEDICATION',
                            'FOLLOWUP',
                            'REVIEW'
                        ]
                    },
                    description: {
                        type: 'string'
                    },
                    category: {
                        type: 'string',
                        enum: [
                            'Explicit',
                            'Inferred',
                            'Conditional'
                        ]
                    },
                    confidence: {
                        type: 'number'
                    },
                    department: {
                        type: 'string'
                    },
                    deadline_days: {
                        type: ['integer', 'null']
                    },
                    depends_on: {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    }
                },
                required: [
                    'type',
                    'description',
                    'category',
                    'confidence',
                    'department',
                    'deadline_days',
                    'depends_on'
                ],
                additionalProperties: false
            }
        }
    },
    required: ['actions'],
    additionalProperties: false
};

function validateExtractedActions(actions) {
    if (!Array.isArray(actions)) {
        throw new Error('Groq returned an invalid actions list');
    }

    return actions.map((action) => {
        const confidence = Number(action.confidence);

        if (
            !Number.isFinite(confidence) ||
            confidence < 0 ||
            confidence > 1
        ) {
            throw new Error(
                `Invalid confidence for action: ${action.description}`
            );
        }

        return {
            type: action.type,
            description: action.description.trim(),
            category: action.category,
            confidence,
            department: action.department.trim(),
            deadline_days:
                action.deadline_days === null
                    ? null
                    : Number(action.deadline_days),
            depends_on: Array.isArray(action.depends_on)
                ? action.depends_on
                : []
        };
    });
}

async function extractCareActions(noteText) {
    if (!noteText || typeof noteText !== 'string') {
        throw new Error('noteText is required');
    }

    /*
     * DEMO_MODE allows you to intentionally use mock extraction.
     *
     * With DEMO_MODE=false, the real Groq API is used.
     */
    if (process.env.DEMO_MODE === 'true') {
        return [
            {
                type: 'TEST',
                description: 'ECG',
                category: 'Explicit',
                confidence: 0.95,
                department: 'Lab',
                deadline_days: 2,
                depends_on: []
            },
            {
                type: 'TEST',
                description: 'Lipid Profile Blood Test',
                category: 'Explicit',
                confidence: 0.95,
                department: 'Lab',
                deadline_days: 2,
                depends_on: []
            },
            {
                type: 'REFERRAL',
                description: 'Cardiology Referral',
                category: 'Explicit',
                confidence: 0.90,
                department: 'Cardiology',
                deadline_days: 3,
                depends_on: []
            },
            {
                type: 'REVIEW',
                description: 'Doctor Review',
                category: 'Explicit',
                confidence: 0.92,
                department: 'Clinic',
                deadline_days: 7,
                depends_on: [
                    'ECG',
                    'Lipid Profile Blood Test'
                ]
            }
        ];
    }

    if (!process.env.GROQ_API_KEY) {
        throw new Error(
            'GROQ_API_KEY is missing. Set it in your .env file.'
        );
    }

    const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',

        temperature: 0,

        messages: [
            {
                role: 'system',
                content: `
You are a clinical care-plan extraction system.

Your task is to extract ONLY actionable care tasks explicitly
supported by the doctor's note.

Do not invent diagnoses, tests, medications, referrals,
appointments, deadlines, or departments.

For every action:
- type must be one of TEST, REFERRAL, MEDICATION, FOLLOWUP, REVIEW
- description should clearly describe the action
- category should indicate whether it is Explicit, Inferred,
  or Conditional
- confidence must be between 0 and 1
- department should identify the responsible department
- deadline_days should be the number of days from the note date
  when a deadline is explicitly stated or reasonably specified
- use null when no deadline is available
- depends_on must contain descriptions of actions that must
  be completed before this action can proceed
- do not create dependencies unless the note supports them

Return only the requested structured data.
        `.trim()
            },
            {
                role: 'user',
                content: noteText
            }
        ],

        response_format: {
            type: 'json_schema',
            json_schema: {
                name: 'care_action_extraction',
                strict: true,
                schema: EXTRACTION_SCHEMA
            }
        }
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('Groq returned an empty response');
    }

    let parsed;

    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Groq returned invalid JSON: ${error.message}`
        );
    }

    return validateExtractedActions(parsed.actions);
}

async function detectAnomaly(planJSON, resultText) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error(
            'GROQ_API_KEY is required for anomaly detection'
        );
    }

    const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        temperature: 0,

        messages: [
            {
                role: 'system',
                content: `
You are a clinical anomaly detection assistant.

Compare the planned care action data with the reported result.

Identify only meaningful inconsistencies or unexpected results.

Return JSON with:
- anomaly_detected: boolean
- reason: string
- severity: LOW, MEDIUM, HIGH, or NONE
        `.trim()
            },
            {
                role: 'user',
                content: JSON.stringify({
                    plan: planJSON,
                    result: resultText
                })
            }
        ],

        response_format: {
            type: 'json_object'
        }
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('Groq returned an empty anomaly response');
    }

    return JSON.parse(content);
}
/*
 * ============================================================
 * SUMANTH — TODO: IMPLEMENT AI FAILURE ANALYSIS
 * ============================================================
 *
 * Add a new function:
 *
 *     async function analyzeFailure(action, error)
 *
 * This function will be called by services/selfHeal.js whenever
 * an action execution fails.
 *
 * IMPORTANT:
 * Groq is ONLY responsible for ANALYZING and EXPLAINING the
 * failure. It must NOT control the retry/escalation logic.
 *
 * selfHeal.js remains responsible for:
 *   - retry count
 *   - retry delay/backoff
 *   - maximum retries
 *   - escalation
 *
 * analyzeFailure() should use the Groq model:
 *
 *     openai/gpt-oss-120b
 *
 * It should analyze:
 *   - the action that failed
 *   - the original error message
 *   - action type
 *   - department
 *   - description
 *
 * Return a structured JSON object like:
 *
 * {
 *   failure_type: "TRANSIENT_SERVICE_ERROR",
 *   severity: "MEDIUM",
 *   explanation: "The external service returned a temporary
 *                 server-unavailable error.",
 *   recommended_action: "RETRY"
 * }
 *
 * Suggested failure_type values:
 *   - TRANSIENT_SERVICE_ERROR
 *   - RATE_LIMIT
 *   - INVALID_DATA
 *   - DEPENDENCY_FAILURE
 *   - AUTHENTICATION_ERROR
 *   - UNKNOWN
 *
 * Suggested severity values:
 *   - LOW
 *   - MEDIUM
 *   - HIGH
 *   - UNKNOWN
 *
 * The function should use structured JSON output rather than
 * asking Groq for free-form text.
 *
 * IMPORTANT:
 * If Groq itself fails, selfHeal.js already has a fallback
 * mechanism. Therefore analyzeFailure() should throw the error
 * normally; selfHeal.js will handle the fallback.
 *
 * After implementing the function, export it below:
 *
 *     analyzeFailure
 *
 * ============================================================
 */

module.exports = {
    groq,
    extractCareActions,
    detectAnomaly
};