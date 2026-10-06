const Groq = require('groq-sdk');
require('dotenv').config();

let groq;

function getGroqClient() {
    if (!process.env.GROQ_API_KEY) {
        throw new Error(
            'GROQ_API_KEY is missing. Set it in your .env file.'
        );
    }

    if (!groq) {
        groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }

    return groq;
}

const VALID_ACTION_TYPES = [
    'TEST',
    'REFERRAL',
    'MEDICATION',
    'FOLLOWUP',
    'REVIEW'
];
const VALID_CATEGORIES = [
    'Explicit',
    'Inferred',
    'Conditional'
];
const VALID_DEPARTMENTS = [
    'Lab',
    'Cardiology',
    'Pharmacy',
    'Clinic',
    'Emergency'
];

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
                        enum: VALID_ACTION_TYPES
                    },
                    description: {
                        type: 'string'
                    },
                    category: {
                        type: 'string',
                        enum: VALID_CATEGORIES
                    },
                    confidence: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1
                    },
                    department: {
                        type: 'string',
                        enum: VALID_DEPARTMENTS
                    },
                    deadline_days: {
                        type: ['integer', 'null'],
                        minimum: 0
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
        if (!action || typeof action !== 'object' || Array.isArray(action)) {
            throw new Error('Groq returned an invalid care action');
        }

        if (
            !VALID_ACTION_TYPES.includes(action.type)
        ) {
            throw new Error(`Invalid action type: ${action.type}`);
        }

        if (
            typeof action.description !== 'string' ||
            !action.description.trim()
        ) {
            throw new Error('Care action description must be a non-empty string');
        }

        if (!VALID_CATEGORIES.includes(action.category)) {
            throw new Error(`Invalid care action category: ${action.category}`);
        }

        if (
            typeof action.confidence !== 'number' ||
            !Number.isFinite(action.confidence) ||
            action.confidence < 0 ||
            action.confidence > 1
        ) {
            throw new Error(
                `Invalid confidence for action: ${action.description}`
            );
        }

        if (!VALID_DEPARTMENTS.includes(action.department)) {
            throw new Error(
                `Invalid department for action "${action.description}": ${action.department}`
            );
        }

        if (
            action.deadline_days !== null &&
            (!Number.isInteger(action.deadline_days) ||
                action.deadline_days < 0)
        ) {
            throw new Error(
                `Invalid deadline_days for action: ${action.description}`
            );
        }

        if (
            !Array.isArray(action.depends_on) ||
            action.depends_on.some(
                (dependency) => typeof dependency !== 'string'
            )
        ) {
            throw new Error(
                `Invalid depends_on list for action: ${action.description}`
            );
        }

        return {
            type: action.type,
            description: action.description.trim(),
            category: action.category,
            confidence: action.confidence,
            department: action.department,
            deadline_days: action.deadline_days,
            depends_on: action.depends_on
        };
    });
}

async function extractCareActions(noteText) {
    if (!noteText || typeof noteText !== 'string') {
        throw new Error('noteText is required');
    }

    const response = await getGroqClient().chat.completions.create({
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

The confidence score represents how certain you are that the
doctor's note supports creating that exact care action. It does
NOT represent clinical correctness, medical safety, or whether
the treatment is medically appropriate.

For every action:
- type must be one of TEST, REFERRAL, MEDICATION, FOLLOWUP, REVIEW
- description should clearly describe the action
- category must be one of:
  - Explicit: the doctor directly states the action or instruction
  - Inferred: the action is strongly implied by the note but is
    not directly stated
  - Conditional: the action depends on a stated condition, future
    event, test result, or unresolved decision
- calibrate confidence according to the certainty expressed in
  the doctor's note
- a clearly recognized action should NOT automatically receive
  1.0; reserve 1.0 for cases where both the action and the
  doctor's intent to create that action are essentially
  unambiguous
- explicit instructions can receive high confidence when they
  are unambiguous
- inferred and conditional actions must reflect their additional
  uncertainty in the confidence score; judge each note
  individually and do not assign them an artificially fixed score
- if the note explicitly says a decision has not been made, do
  not turn that undecided statement into a high-confidence
  actionable instruction
- do not invent actions merely because they would be medically
  reasonable
- confidence must be between 0 and 1
- department should identify the responsible department
- deadline_days must only reflect a deadline explicitly stated
  in the note
- use null when no deadline is available
- depends_on must contain descriptions of actions that must
  be completed before this action can proceed
- do not create dependencies unless the note supports them
- if the note contains no actionable care instructions, return
  an empty actions array

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
    const response = await getGroqClient().chat.completions.create({
        model: 'openai/gpt-oss-120b',
        temperature: 0,

        messages: [
            {
                role: 'system',
                content: `
You are a clinical anomaly detection assistant.

Compare the planned care action data with the reported result.

Identify only meaningful inconsistencies or unexpected results.

Return JSON with exactly these fields:

- anomaly_detected: boolean
- finding: string
- reason: string
- severity: LOW, MEDIUM, HIGH, or NONE
- suggested_action: string
- suggested_department: Lab, Cardiology, Pharmacy, Clinic, or Emergency
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
    get groq() {
        return getGroqClient();
    },
    extractCareActions,
    detectAnomaly
};