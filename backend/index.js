require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001; // <--- ADD THIS LINE

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/patients', require('./routes/patients'));
app.use('/api/journeys', require('./routes/journeys'));
app.use('/api/actions', require('./routes/actions'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/mock', require('./routes/mock'));
app.use('/api/slots', require('./routes/slots'));

// Health check — team hits this to confirm server is up
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

require('./jobs/gapDetector');
require('./jobs/dropRisk');

app.listen(PORT, () => {
    console.log(`CareLoop backend running on port ${PORT}`);
});