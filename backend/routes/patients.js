const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
    return res.status(501).json({
        error:
            'Patient directory is unavailable: this checkout contains no verified patient table or schema mapping. ' +
            'Provide the actual patient table name and the definitions for its ID and name columns.'
    });
});

module.exports = router;