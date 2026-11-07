import { validateDynamoDB, initRabbitMQ, docClient, rabbitChannel } from './local-env-setup';

import express from 'express';
import { MttRestHandler } from '@mytaptrack/lib';
import { runLambda } from './lambda-adapter';

const app = express();
app.use(express.json());
app.use(express.text());

// Import handlers
import { get as timeGet } from '../device/functions/api/timeGet';
import { put as dataPut } from '../device/functions/api/dataPut';
import { put as audioPut } from '../device/functions/api/audioPut';
import { eventHandler as appDelete } from '../device/functions/appApi/appDelete';
import { put as appTokenRetrieve } from '../device/functions/appApi/appTokenRetrieve';
import { put as appTokenTrack } from '../device/functions/appApi/appTokenTrack';
import { put as notesPut } from '../device/functions/appApi/notesPut';
import { check as firmwarePost } from '../device/functions/api/firmwarePost';

const handleLambda = (handler: MttRestHandler, req: express.Request, res: express.Response) =>
    runLambda(handler, req, res, { stage: 'local' });

// Device API routes (bare paths)
app.get('/time', (req, res) => handleLambda(timeGet, req, res));
app.put('/data', (req, res) => handleLambda(dataPut, req, res));
app.put('/audio', (req, res) => handleLambda(audioPut, req, res));
app.post('/firmware', (req, res) => handleLambda(firmwarePost, req, res));

// App API routes (bare paths)
app.delete('/app', (req, res) => handleLambda(appDelete, req, res));
app.post('/app', (req, res) => handleLambda(appTokenRetrieve, req, res));
app.post('/v3/app', (req, res) => handleLambda(appTokenRetrieve, req, res));
app.put('/app', (req, res) => handleLambda(appTokenTrack, req, res));
app.put('/app/notes', (req, res) => handleLambda(notesPut, req, res));

// Device API routes with /prod prefix (matches config dev.yml device.path = /prod)
app.get('/prod/time', (req, res) => handleLambda(timeGet, req, res));
app.put('/prod/data', (req, res) => handleLambda(dataPut, req, res));
app.put('/prod/audio', (req, res) => handleLambda(audioPut, req, res));
app.post('/prod/firmware', (req, res) => handleLambda(firmwarePost, req, res));

// App API routes with /prod prefix
app.delete('/prod/app', (req, res) => handleLambda(appDelete, req, res));
app.post('/prod/app', (req, res) => handleLambda(appTokenRetrieve, req, res));
app.post('/prod/v3/app', (req, res) => handleLambda(appTokenRetrieve, req, res));
app.put('/prod/app', (req, res) => handleLambda(appTokenTrack, req, res));
app.put('/prod/app/notes', (req, res) => handleLambda(notesPut, req, res));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'device-api' });
});

const PORT = process.env.PORT || 3001;

async function start() {
    await validateDynamoDB();
    app.listen(PORT, () => {
        console.log(`Device API server running on http://localhost:${PORT}`);
    });
}

start().catch((error) => {
    console.error('Failed to start device server:', error);
    process.exit(1);
});
