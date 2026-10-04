/*
 * ============================================================
 * SUDARSHAN — FRONTEND INTEGRATION
 * ============================================================
 *
 * You do NOT need to modify this backend route.
 *
 * Use these APIs to build the CareLoop audit timeline:
 *
 * 1. GET /api/audit
 *    → Recent audit events for the Coordinator Dashboard
 *
 * 2. GET /api/audit/:journeyId
 *    → Complete chronological audit history for one journey
 *
 * Display events such as:
 *
 *   ACTION_CREATED
 *   CREATED → VALIDATED
 *   VALIDATED → ASSIGNED
 *   ASSIGNED → SCHEDULED
 *   SCHEDULED → IN_PROGRESS
 *   IN_PROGRESS → COMPLETED
 *   RETRY
 *   ANOMALY_DETECTED
 *   ESCALATED
 *
 * Recommended UI:
 * - Coordinator Dashboard: show recent system events.
 * - Journey Details: show a chronological timeline for that
 *   patient's journey.
 * - Clearly distinguish normal workflow, retries, escalations,
 *   and anomalies.
 * - Show timestamp, actor, event, reason, and relevant action.
 *
 * IMPORTANT:
 * Do not create or modify audit records from the frontend.
 * The backend services are responsible for generating the
 * audit trail.
 *
 * Backend:
 *   audit.js → READ audit history
 *
 * Frontend:
 *   Sudarshan → DISPLAY audit history
 *
 * ============================================================
 */

const express = require('express');

const router = express.Router();
const supabase = require('../supabase');

const MAX_LIMIT = 200;

/**
 * Validate UUID before querying Supabase.
 */
function isValidUUID(value) {
    return (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
}

/**
 * Parse and safely clamp a requested limit.
 */
function parseLimit(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 100;
    }

    return Math.min(parsed, MAX_LIMIT);
}

/**
 * ------------------------------------------------------------
 * GET /api/audit/:journeyId
 * ------------------------------------------------------------
 *
 * Returns the complete audit trail for one care journey.
 *
 * Used by:
 *   - Journey detail page
 *   - Doctor/coordinator timeline
 *   - Demo audit trail
 */
router.get('/:journeyId', async (req, res) => {
    try {
        const { journeyId } = req.params;

        if (!isValidUUID(journeyId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid journey ID'
            });
        }

        const { data, error } = await supabase
            .from('audit_log')
            .select('*')
            .eq('journey_id', journeyId)
            .order('ts', { ascending: true });

        if (error) {
            console.error(
                `Failed to fetch audit log for journey ${journeyId}:`,
                error
            );

            return res.status(500).json({
                success: false,
                error: 'Failed to fetch journey audit log'
            });
        }

        return res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Unexpected audit journey error:', error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * ------------------------------------------------------------
 * GET /api/audit
 * ------------------------------------------------------------
 *
 * Returns the most recent audit events for the coordinator
 * dashboard.
 *
 * Optional:
 *
 *   GET /api/audit?limit=50
 *
 * Maximum is intentionally capped to prevent accidentally
 * loading a very large audit history.
 */
router.get('/', async (req, res) => {
    try {
        const limit = parseLimit(req.query.limit);

        const { data, error } = await supabase
            .from('audit_log')
            .select('*')
            .order('ts', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Failed to fetch audit log:', error);

            return res.status(500).json({
                success: false,
                error: 'Failed to fetch audit log'
            });
        }

        return res.json({
            success: true,
            data: data || [],
            limit
        });
    } catch (error) {
        console.error('Unexpected audit log error:', error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;