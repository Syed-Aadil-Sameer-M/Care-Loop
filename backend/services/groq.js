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
You are a clinical plan anomaly detection assistant. Compare the ACTIVE CARE PLAN with the NEW CLINICAL RESULT.

Report an anomaly only when the result meaningfully contradicts the active plan, contains an unexpected finding supported by the result, or requires deviation from the current plan. A normal result that is expected under the plan is not an anomaly. Do not infer a contradiction from missing information or uncertainty; when the evidence is ambiguous or insufficient, set anomaly_detected to false and severity to NONE.

Do not invent a diagnosis, result, clinical fact, or contradiction. Do not recommend an action unrelated to the new result. When an anomaly is detected, suggest only a cautious, result-related next action for doctor review; the suggestion is not authorization to change or execute the care plan.

Return a JSON object with exactly these fields and types:
{
  "anomaly_detected": boolean,
  "finding": string,
  "reason": string,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "NONE",
  "suggested_action": string,
  "suggested_department": "Lab" | "Cardiology" | "Pharmacy" | "Clinic" | "Emergency"
}

When anomaly_detected is false, use an empty suggested_action and severity NONE. Never use a false result as a reason to create an action.
        `.trim()
            },
            {
                role: 'user',
                content: JSON.stringify({
                    active_care_plan: planJSON,
                    new_clinical_result: resultText
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

    let parsed;

    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Groq returned invalid anomaly JSON: ${error.message}`
        );
    }

    return validateAnomalyResponse(parsed);
}

function validateAnomalyResponse(analysis) {
    const requiredFields = [
        'anomaly_detected',
        'finding',
        'reason',
        'severity',
        'suggested_action',
        'suggested_department'
    ];
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'NONE'];

    if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
        throw new Error('Groq returned an invalid anomaly response object');
    }

    const unexpectedFields = Object.keys(analysis).filter(
        (field) => !requiredFields.includes(field)
    );
    const missingFields = requiredFields.filter(
        (field) => !Object.prototype.hasOwnProperty.call(analysis, field)
    );

    if (missingFields.length || unexpectedFields.length) {
        throw new Error(
            `Groq anomaly response must contain exactly the required fields; ` +
            `missing: ${missingFields.join(', ') || 'none'}; ` +
            `unexpected: ${unexpectedFields.join(', ') || 'none'}`
        );
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

    if (!validSeverities.includes(analysis.severity)) {
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

    return analysis;
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

const FAILURE_TYPE_VALUES = [
    'TRANSIENT_SERVICE_ERROR',
    'RATE_LIMIT',
    'INVALID_DATA',
    'DEPENDENCY_FAILURE',
    'AUTHENTICATION_ERROR',
    'UNKNOWN'
];

const FAILURE_SEVERITY_VALUES = [
    'LOW',
    'MEDIUM',
    'HIGH',
    'UNKNOWN'
];

const FAILURE_ANALYSIS_REQUIRED_FIELDS = [
    'failure_type',
    'severity',
    'explanation',
    'recommended_action'
];

function sanitizeErrorMessage(message) {
    const fallback = 'Execution failed (error details unavailable).';

    try {
        const source =
            typeof message === 'string'
                ? message
                : message && typeof message.message === 'string'
                    ? message.message
                    : String(message);

        if (!source.trim()) {
            return fallback;
        }

        return source
            .replace(
                /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,
                '[REDACTED_PRIVATE_KEY]'
            )
            .replace(/\b(?:set-cookie|cookie)\s*:\s*[^\r\n]*/gi, '[REDACTED_COOKIE]')
            .replace(
                /\b(?:proxy-authorization|authorization)\s*[:=]\s*[^\r\n,;]+/gi,
                '[REDACTED_AUTHORIZATION]'
            )
            .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[REDACTED_AUTH_TOKEN]')
            .replace(
                /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@[^ \s"'<>]+/gi,
                '[REDACTED_CONNECTION_STRING]'
            )
            .replace(
                /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s"'<>]+/gi,
                '[REDACTED_CONNECTION_STRING]'
            )
            .replace(
                /\b(?:sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{35})\b/g,
                '[REDACTED_API_KEY]'
            )
            .replace(
                /(["']?\b[A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?[_-]?(?:token)?|client[_-]?secret|secret[_-]?key|password|passwd|pwd|token|secret|cookie)[A-Za-z0-9_-]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,\s;}]+)/gi,
                '$1[REDACTED]'
            )
            .replace(
                /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
                '[REDACTED_JWT]'
            )
            .slice(0, 2000);
    } catch {
        return fallback;
    }
}

function validateFailureAnalysisResponse(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Groq returned an invalid failure-analysis response object');
    }

    const unexpectedFields = Object.keys(result).filter(
        (field) => !FAILURE_ANALYSIS_REQUIRED_FIELDS.includes(field)
    );
    const missingFields = FAILURE_ANALYSIS_REQUIRED_FIELDS.filter(
        (field) => !Object.prototype.hasOwnProperty.call(result, field)
    );

    if (missingFields.length || unexpectedFields.length) {
        throw new Error(
            `Groq failure-analysis response must contain exactly the required fields; ` +
            `missing: ${missingFields.join(', ') || 'none'}; ` +
            `unexpected: ${unexpectedFields.join(', ') || 'none'}`
        );
    }

    if (!FAILURE_TYPE_VALUES.includes(result.failure_type)) {
        throw new Error(`Invalid failure type: ${result.failure_type}`);
    }

    if (!FAILURE_SEVERITY_VALUES.includes(result.severity)) {
        throw new Error(`Invalid failure severity: ${result.severity}`);
    }

    if (typeof result.explanation !== 'string' || !result.explanation.trim()) {
        throw new Error('Failure explanation must be a non-empty string');
    }

    if (
        typeof result.recommended_action !== 'string' ||
        !result.recommended_action.trim()
    ) {
        throw new Error('Failure recommended_action must be a non-empty string');
    }

    return {
        failure_type: result.failure_type,
        severity: result.severity,
        explanation: result.explanation.trim(),
        recommended_action: result.recommended_action.trim()
    };
}

async function analyzeFailure(action, error) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
        throw new Error('Action is required for failure analysis');
    }

    const actionType = typeof action.type === 'string' ? action.type.trim() : '';
    const department = typeof action.department === 'string' ? action.department.trim() : '';
    const description = typeof action.description === 'string' ? action.description.trim() : '';

    if (!actionType) {
        throw new Error('Action type is required for failure analysis');
    }

    if (!department) {
        throw new Error('Action department is required for failure analysis');
    }

    if (!description) {
        throw new Error('Action description is required for failure analysis');
    }

    const safeActionType = sanitizeErrorMessage(actionType);
    const safeDepartment = sanitizeErrorMessage(department);
    const safeDescription = sanitizeErrorMessage(description);

    if (!error) {
        throw new Error('Original error is required for failure analysis');
    }

    const sanitizedErrorMessage = sanitizeErrorMessage(error);

    const response = await getGroqClient().chat.completions.create({
        model: 'openai/gpt-oss-120b',
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: `
You are a failure-analysis assistant for CareLoop operations.

Assess the failed care action execution and explain the likely root cause
without deciding the execution policy. The Groq model must only analyze and
classify the failure. It must not choose retry counts, delays, or escalation.

Use the following inputs:
- action type
- action department
- action description
- original error message

Return ONLY valid JSON with exactly these fields:
{
  "failure_type": "TRANSIENT_SERVICE_ERROR",
  "severity": "MEDIUM",
  "explanation": "Short explanation of the failure reason.",
  "recommended_action": "RETRY"
}

Allowed failure_type values:
- TRANSIENT_SERVICE_ERROR
- RATE_LIMIT
- INVALID_DATA
- DEPENDENCY_FAILURE
- AUTHENTICATION_ERROR
- UNKNOWN

Allowed severity values:
- LOW
- MEDIUM
- HIGH
- UNKNOWN

Rules:
- Do not expose secrets or authorization details.
- Do not invent facts not implied by the error.
- Keep the explanation concise and factual.
- recommended_action should be a short operational recommendation only.
- Do not decide retry timing, max retries, or escalation policy.
                `.trim()
            },
            {
                role: 'user',
                content: JSON.stringify({
                    action_type: safeActionType,
                    department: safeDepartment,
                    description: safeDescription,
                    original_error: sanitizedErrorMessage
                })
            }
        ],
        response_format: {
            type: 'json_object'
        }
    });

    const content = response.choices?.[0]?.message?.content?.trim();

    if (!content) {
        throw new Error('Groq returned an empty failure-analysis response');
    }

    let parsed;

    try {
        parsed = JSON.parse(content);
    } catch (analysisError) {
        throw new Error(
            `Groq returned invalid failure-analysis JSON: ${analysisError.message}`
        );
    }

    return validateFailureAnalysisResponse(parsed);
}

module.exports = {
    get groq() {
        return getGroqClient();
    },
    extractCareActions,
    detectAnomaly,
    classifyPatientIntent,
    analyzeFailure,
    sanitizeErrorMessage
};