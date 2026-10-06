<<<<<<< HEAD
const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
    return res.status(501).json({
        error:
            'Patient directory is unavailable: this checkout contains no verified patient table or schema mapping. ' +
            'Provide the actual patient table name and the definitions for its ID and name columns.'
    });
=======
```javascript
/*
 * ============================================================
 * PATIENT ROUTE OWNERSHIP
 * ============================================================
 *
 * This route is responsible only for READ access to the
 * patients table.
 *
 * Current API:
 *
 *   GET /api/patients
 *   GET /api/patients/:id
 *
 * Requirements:
 *   - Validate patient UUIDs before querying Supabase.
 *   - Always check Supabase errors.
 *   - Return 404 when a patient does not exist.
 *   - Keep response format consistent:
 *
 *       {
 *         "success": true,
 *         "data": ...
 *       }
 *
 * Do NOT put care-journey, care-action, execution, dependency,
 * anomaly, retry, or state-machine logic in this file.
 *
 * Ownership:
 *
 *   patients.js
 *       = patient lookup
 *
 *   journeys.js
 *       = care journey creation/retrieval
 *
 *   actions.js
 *       = care-action operations
 *
 *   stateMachine.js
 *       = authoritative state transitions + audit
 *
 *   executor.js
 *       = action execution
 *
 *   selfHeal.js
 *       = retry/recovery/escalation
 *
 *   anomaly.js
 *       = completed-result anomaly analysis
 *
 * Keep this route intentionally thin.
 *
 * ============================================================
 */
```

const express = require('express');

const router = express.Router();
const supabase = require('../supabase');

/**
 * Validate UUID before sending it to Supabase.
 *
 * This avoids unnecessary database queries for malformed IDs
 * and gives the frontend a predictable 400 response.
 */
function isValidUUID(value) {
    return (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
}

/**
 * GET /api/patients
 *
 * Returns all patients ordered alphabetically by name.
 */
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Failed to fetch patients:', error);

            return res.status(500).json({
                success: false,
                error: 'Failed to fetch patients'
            });
        }

        return res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Unexpected error while fetching patients:', error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * GET /api/patients/:id
 *
 * Returns one patient by UUID.
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidUUID(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid patient ID'
            });
        }

        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error(`Failed to fetch patient ${id}:`, error);

            return res.status(500).json({
                success: false,
                error: 'Failed to fetch patient'
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Unexpected error while fetching patient:', error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
>>>>>>> 6b987926ecb08ff7edaca19e6bcba1ee53280b93
});

module.exports = router;