const CONFIDENCE_THRESHOLD = 0.85;

function getConfidenceTargetState(confidence) {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('Confidence must be a finite number from 0 to 1.');
    }
    return confidence >= CONFIDENCE_THRESHOLD ? 'VALIDATED' : 'HELD';
}

function getExecutableActions(actions) {
    return actions.filter((action) => action.state === 'VALIDATED');
}

module.exports = {
    CONFIDENCE_THRESHOLD,
    getConfidenceTargetState,
    getExecutableActions
};
