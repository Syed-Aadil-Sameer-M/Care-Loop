require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function mountRouter(path, modulePath) {
    const router = require(modulePath);
    if (typeof router !== 'function') {
        console.warn(`Skipping ${path}: route module is not implemented.`);
        return;
    }
    app.use(path, router);
}

mountRouter('/api/patients', './routes/patients');
mountRouter('/api/journeys', './routes/journeys');
mountRouter('/api/actions', './routes/actions');
mountRouter('/api/audit', './routes/audit');
mountRouter('/api/mock', './routes/mock');
mountRouter('/api/slots', './routes/slots');

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

require('./jobs/gapDetector');
require('./jobs/dropRisk');

app.listen(PORT, () => {
    console.log(`CareLoop backend running on port ${PORT}`);
});