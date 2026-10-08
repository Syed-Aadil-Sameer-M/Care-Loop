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

/**
 * Feature 5 — Patient Intent Classification
 *
 * Converts a patient's natural-language message into a controlled
 * intent.
 *
 * IMPORTANT:
 * This function ONLY understands/classifies the message.
 * It does NOT modify action state or the database.
 *
 * The state transition remains the responsibility of
 * stateMachine.js / patientChat.js.
 */
async function classifyPatientIntent(message) {
    if (!message || typeof message !== 'string' || !message.trim()) {
        throw new Error('Patient message is required');
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
You are the patient-intent classifier for CareLoop.

Classify the patient's message into EXACTLY ONE of:

CONFIRM
RESCHEDULE
URGENT
QUESTION
DENY
OTHER

CONFIRM:
The patient confirms that they completed, accepted, or will
follow the requested care action.

RESCHEDULE:
The patient cannot perform the action at the scheduled time/date
and wants to postpone or change it.

URGENT:
The patient reports a concerning symptom, severe problem,
possible adverse reaction, deterioration, or explicitly asks
for urgent help.

QUESTION:
The patient is asking for information or clarification.

DENY:
The patient explicitly refuses or does not want to perform
the requested care action.

OTHER:
The message does not clearly fit any of the above categories.

Return ONLY valid JSON:

{
  "intent": "CONFIRM",
  "confidence": 0.95,
  "reason": "Short explanation"
}

Rules:
- intent must be exactly one of the six allowed values.
- confidence must be a number between 0 and 1.
- reason must be short.
- Do not return markdown.
- Do not modify database state.
- Do not make medical diagnoses.
- Do not provide medical recommendations.
        `.trim()
            },
            {
                role: 'user',
                content: message.trim()
            }
        ],

        response_format: {
            type: 'json_object'
        },

        max_tokens: 200
    });

    const content = response.choices?.[0]?.message?.content?.trim();

    if (!content) {
        throw new Error(
            'Groq returned an empty patient-intent response'
        );
    }

    let result;

    try {
        result = JSON.parse(content);
    } catch (error) {
        console.error(
            'Invalid patient-intent response:',
            content
        );

        throw new Error(
            `Groq returned invalid patient-intent JSON: ${error.message}`
        );
    }

    const validIntents = [
        'CONFIRM',
        'RESCHEDULE',
        'URGENT',
        'QUESTION',
        'DENY',
        'OTHER'
    ];

    if (!validIntents.includes(result.intent)) {
        throw new Error(
            `Invalid patient intent: ${result.intent}`
        );
    }

    const confidence = Number(result.confidence);

    if (
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1
    ) {
        throw new Error(
            'Invalid patient-intent confidence'
        );
    }

    return {
        intent: result.intent,
        confidence,
        reason:
            typeof result.reason === 'string'
                ? result.reason.trim()
                : 'Intent classified from patient message'
    };
}

async function analyzeFailure(action, error) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is missing. Set it in your .env file.');
    }

    const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: `
You are an AI failure analysis assistant for a clinical care execution system.

Your task is to analyze an action execution failure and return a structured JSON analysis.
You only analyze and explain the failure; you do not control retry or escalation logic.

Analyze the provided action and error details and return exactly ONE JSON object with these fields:
- failure_type (one of: TRANSIENT_SERVICE_ERROR, RATE_LIMIT, INVALID_DATA, DEPENDENCY_FAILURE, AUTHENTICATION_ERROR, UNKNOWN)
- severity (one of: LOW, MEDIUM, HIGH, UNKNOWN)
- explanation (a short human-readable string explaining why the error occurred)
- recommended_action (a short string suggesting the next step, e.g., "RETRY" or "ESCALATE")

Return only the requested structured JSON data without markdown.
        `.trim()
            },
            {
                role: 'user',
                content: JSON.stringify({
                    action: {
                        type: action.type,
                        department: action.department,
                        description: action.description
                    },
                    error_message: error?.message || error
                })
            }
        ],
        response_format: {
            type: 'json_object'
        },
        max_tokens: 200
    });

    const content = response.choices?.[0]?.message?.content?.trim();

    if (!content) {
        throw new Error('Groq returned an empty failure analysis response');
    }

    let result;
    try {
        result = JSON.parse(content);
    } catch (parseError) {
        console.error('Invalid failure analysis response:', content);
        throw new Error(`Groq returned invalid failure analysis JSON: ${parseError.message}`);
    }

    return {
        failure_type: result.failure_type || 'UNKNOWN',
        severity: result.severity || 'UNKNOWN',
        explanation: result.explanation || 'An unknown error occurred.',
        recommended_action: result.recommended_action || 'RETRY'
    };
}

module.exports = {
    groq,
    extractCareActions,
    detectAnomaly,
    classifyPatientIntent,
    analyzeFailure
};