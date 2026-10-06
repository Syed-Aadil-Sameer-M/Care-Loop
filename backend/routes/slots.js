// backend/routes/slots.js
const express = require('express');
const router = express.Router();
const { supabase } = require('../superbase');

/**
 * GET /api/slots
 * Fetch available time slots for care actions
 */
router.get('/', async (req, res) => {
  try {
    const { data: slots, error } = await supabase
      .from('slots')
      .select('*');

    if (error) {
      // If table doesn't exist yet, return mock empty slots gracefully
      return res.json({ slots: [] });
    }

    res.json({ slots: slots || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;