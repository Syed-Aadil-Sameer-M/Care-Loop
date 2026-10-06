const express = require('express');

const router = express.Router();

const PATIENT_DIRECTORY_UNAVAILABLE_MESSAGE =
    'Patient directory is unavailable: this checkout contains no verified patient table or schema mapping. ' +
    'Provide the actual patient table name and the definitions for its ID and name columns.';

router.get('/', (_req, res) => {
    return res.status(501).json({
        error: PATIENT_DIRECTORY_UNAVAILABLE_MESSAGE
    });
});

router.get('/:id', (_req, res) => {
    return res.status(501).json({
        error: PATIENT_DIRECTORY_UNAVAILABLE_MESSAGE
    });
});

module.exports = router;
