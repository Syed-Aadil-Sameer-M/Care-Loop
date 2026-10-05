const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_KEY ||= 'test-only-key';
process.env.GROQ_API_KEY ||= 'test-only-key';

const patientRouter = require('../routes/patients');
const { createActionRouter } = require('../routes/actions');
const { createTransition } = require('../services/stateMachine');
const { createExecutor } = require('../services/executor');
const {
    getConfidenceTargetState,
    getExecutableActions
} = require('../services/confidenceGate');

const HELD_ACTION_ID = '018f47b2-9d65-4c8a-9d37-735b5f05b008';
const NON_HELD_ACTION_ID = '118f47b2-9d65-4c8a-9d37-735b5f05b008';

let server;
let baseUrl;

before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/patients', patientRouter);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
    );
});

function createFakeSupabase(action) {
    return {
        from(table) {
            assert.equal(table, 'care_actions');
            return {
                select() {
                    return this;
                },
                eq(column, value) {
                    assert.equal(column, 'id');
                    assert.equal(value, action.id);
                    return this;
                },
                async maybeSingle() {
                    return { data: action, error: null };
                }
            };
        }
    };
}

function createReviewApp({ action, transition, executeAction }) {
    const app = express();
    app.use(express.json());
    app.use(
        '/api/actions',
        createActionRouter({
            supabase: createFakeSupabase(action),
            transition,
            executeAction
        })
    );
    return app;
}

async function sendReview(app, actionId, body) {
    const reviewServer = app.listen(0);
    await new Promise((resolve) => reviewServer.once('listening', resolve));
    try {
        const response = await fetch(
            `http://127.0.0.1:${reviewServer.address().port}/api/actions/${actionId}/review`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );
        return {
            status: response.status,
            body: await response.json()
        };
    } finally {
        await new Promise((resolve, reject) =>
            reviewServer.close((error) => (error ? reject(error) : resolve()))
        );
    }
}

test('patient directory returns honest 501 until schema is verified', async () => {
    const response = await fetch(`${baseUrl}/api/patients`);
    assert.equal(response.status, 501);
    const body = await response.json();
    assert.match(body.error, /no verified patient table or schema mapping/i);
});

test('confidence threshold validates at 0.85 and holds below it', () => {
    assert.equal(getConfidenceTargetState(0.85), 'VALIDATED');
    assert.equal(getConfidenceTargetState(0.849999), 'HELD');
    assert.deepEqual(
        getExecutableActions([
            { id: 'approved', state: 'VALIDATED' },
            { id: 'held', state: 'HELD' }
        ]).map((action) => action.id),
        ['approved']
    );
});

test('approval transitions HELD to VALIDATED, audits decision, then invokes executor', async () => {
    const action = { id: HELD_ACTION_ID, state: 'HELD', journey_id: 'journey-1' };
    let transitionArgs;
    let executed;
    const app = createReviewApp({
        action,
        transition: async (...args) => {
            transitionArgs = args;
            return { ...action, state: 'VALIDATED' };
        },
        executeAction: async (approvedAction) => {
            executed = approvedAction;
        }
    });

    const result = await sendReview(app, HELD_ACTION_ID, {
        decision: 'APPROVE',
        reason: 'Reviewed against the clinical note.'
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
        success: true,
        action_id: HELD_ACTION_ID,
        previous_state: 'HELD',
        state: 'VALIDATED'
    });
    assert.equal(transitionArgs[1], 'VALIDATED');
    assert.equal(transitionArgs[2], 'DOCTOR');
    assert.equal(transitionArgs[3], 'Reviewed against the clinical note.');
    assert.equal(transitionArgs[5].expectedState, 'HELD');
    assert.equal(transitionArgs[5].auditMeta.decision, 'APPROVE');
    assert.ok(transitionArgs[5].auditMeta.decision_at);
    assert.equal(executed.state, 'VALIDATED');
});

test('rejection transitions HELD to existing CANCELLED state and does not execute', async () => {
    let transitionArgs;
    let executed = false;
    const app = createReviewApp({
        action: { id: HELD_ACTION_ID, state: 'HELD' },
        transition: async (...args) => {
            transitionArgs = args;
            return { id: HELD_ACTION_ID, state: 'CANCELLED' };
        },
        executeAction: async () => {
            executed = true;
        }
    });

    const result = await sendReview(app, HELD_ACTION_ID, {
        decision: 'REJECT',
        reason: 'Not supported by the current plan.'
    });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(result.status, 200);
    assert.equal(result.body.state, 'CANCELLED');
    assert.equal(transitionArgs[1], 'CANCELLED');
    assert.equal(transitionArgs[2], 'DOCTOR');
    assert.equal(transitionArgs[5].expectedState, 'HELD');
    assert.equal(transitionArgs[5].auditMeta.decision, 'REJECT');
    assert.equal(executed, false);
});

test('non-HELD action cannot be reviewed', async () => {
    let transitionCalled = false;
    const app = createReviewApp({
        action: { id: NON_HELD_ACTION_ID, state: 'VALIDATED' },
        transition: async () => {
            transitionCalled = true;
        },
        executeAction: async () => {}
    });

    const result = await sendReview(app, NON_HELD_ACTION_ID, {
        decision: 'APPROVE',
        reason: 'Review.'
    });

    assert.equal(result.status, 409);
    assert.equal(transitionCalled, false);
});

test('invalid ID, decision, and missing reason are rejected', async () => {
    const app = createReviewApp({
        action: { id: HELD_ACTION_ID, state: 'HELD' },
        transition: async () => assert.fail('invalid request must not transition'),
        executeAction: async () => assert.fail('invalid request must not execute')
    });

    assert.equal((await sendReview(app, 'not-an-id', {
        decision: 'APPROVE',
        reason: 'Review.'
    })).status, 400);
    assert.equal((await sendReview(app, HELD_ACTION_ID, {
        decision: 'VALIDATED',
        reason: 'Review.'
    })).status, 400);
    assert.equal((await sendReview(app, HELD_ACTION_ID, {
        decision: 'APPROVE',
        reason: '  '
    })).status, 400);
});

test('state transition writes state, actor, reason, and timestamp to audit metadata', async () => {
    const action = { id: HELD_ACTION_ID, journey_id: 'journey-1', state: 'HELD' };
    let auditRecord;
    let updateValues;
    let expectedStateFilter;

    const client = {
        from(table) {
            if (table === 'care_actions') {
                return {
                    select() {
                        return this;
                    },
                    eq(column, value) {
                        if (column === 'id') return this;
                        if (column === 'state') expectedStateFilter = value;
                        return this;
                    },
                    async single() {
                        return { data: action, error: null };
                    },
                    update(values) {
                        updateValues = values;
                        return this;
                    },
                    maybeSingle() {
                        return Promise.resolve({
                            data: { ...action, ...updateValues },
                            error: null
                        });
                    }
                };
            }
            assert.equal(table, 'audit_log');
            return {
                async insert(record) {
                    auditRecord = record;
                    return { error: null };
                }
            };
        }
    };

    const transition = createTransition(client);
    const result = await transition(
        HELD_ACTION_ID,
        'VALIDATED',
        'DOCTOR',
        'Reviewed.',
        {},
        {
            expectedState: 'HELD',
            auditMeta: { decision: 'APPROVE', decision_at: '2026-10-05T00:00:00.000Z' }
        }
    );

    assert.equal(result.state, 'VALIDATED');
    assert.equal(expectedStateFilter, 'HELD');
    assert.equal(auditRecord.action_id, HELD_ACTION_ID);
    assert.equal(auditRecord.actor, 'DOCTOR');
    assert.equal(auditRecord.reason, 'Reviewed.');
    assert.equal(auditRecord.meta.previous_state, 'HELD');
    assert.equal(auditRecord.meta.new_state, 'VALIDATED');
    assert.equal(auditRecord.meta.decision, 'APPROVE');
    assert.ok(auditRecord.meta.transitioned_at);
});

test('approval execution blocks when a prerequisite is incomplete', async () => {
    const transitions = [];
    const client = {
        from(table) {
            const query = {
                select() {
                    return query;
                },
                eq() {
                    return query;
                },
                in() {
                    return query;
                },
                then(resolve, reject) {
                    const data =
                        table === 'action_dependencies'
                            ? [{ depends_on_action_id: 'parent-action' }]
                            : [{ state: 'IN_PROGRESS' }];
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                }
            };
            return query;
        }
    };
    const executor = createExecutor({
        client,
        transitionAction: async (_id, state) => {
            transitions.push(state);
            return { id: HELD_ACTION_ID, state };
        },
        selfHealAction: async () => assert.fail('dependency wait is not a booking failure')
    });

    await executor.executeAction({ id: HELD_ACTION_ID, state: 'VALIDATED' });
    assert.deepEqual(transitions, ['BLOCKED']);
});

test('state machine rejects a stale expected state without auditing or execution', async () => {
    let auditWritten = false;
    const client = {
        from(table) {
            assert.equal(table, 'care_actions');
            return {
                select() {
                    return this;
                },
                eq() {
                    return this;
                },
                async single() {
                    return {
                        data: { id: HELD_ACTION_ID, journey_id: 'journey-1', state: 'ASSIGNED' },
                        error: null
                    };
                }
            };
        }
    };
    const transition = createTransition(client);
    const result = await transition(
        HELD_ACTION_ID,
        'VALIDATED',
        'DOCTOR',
        'Review.',
        {},
        { expectedState: 'HELD' }
    );
    assert.equal(result, null);
    assert.equal(auditWritten, false);
});
