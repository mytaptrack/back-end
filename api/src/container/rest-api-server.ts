// Load local environment setup FIRST
require('./local-env-setup');

import express from 'express';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { AuthManager } from './auth-manager';
import { SAMLHandler } from './saml-handler';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For SAML form data

// Logging middleware for all incoming requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`, {
        query: req.query,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Import handlers
import { handleEvent as devicesGet } from '../v2/student/devices/general/get';
import { handleEvent as appPut } from '../v2/student/devices/app/put';
import { handleEvent as appDelete } from '../v2/student/devices/app/delete';
import { handleEvent as appTokenGet } from '../v2/student/devices/app/tokenGet';
import { handleEvent as deviceAppGet } from '../v2/student/devices/app/get';
import { handleEvent as deviceAppQrCodeGet } from '../v2/student/devices/app/qrCodeGet';
import { handleEvent as deviceTrackGet } from '../v2/student/devices/track/get';
import { handleEvent as deviceTrackPut } from '../v2/student/devices/track/put';
import { handleEvent as deviceTrackDelete } from '../v2/student/devices/track/delete';
import { handleEvent as deviceTrackTermGet } from '../v2/student/devices/track/termGet';
import { handleEvent as deviceTrackTermPut } from '../v2/student/devices/track/termPut';
import { handleEvent as deviceTrackRegisterPut } from '../v2/student/devices/track/registerPut';
import { handleEvent as deviceTrackResyncPost } from '../v2/student/devices/track/resyncPost';
import { get as userGet } from '../v2/user/userGet';
import { put as userPut } from '../v2/user/userPut';
import { handleEvent as manageAbcPut } from '../v2/manage/abc/put';
import { handleEvent as manageLicenseGet } from '../v2/manage/license/get';
import { handleEvent as manageStatsGet } from '../v2/manage/license/statsGet';
import { handleEvent as manageLicenseStudentPut } from '../v2/manage/license/studentPut';
import { handleEvent as manageAppsGet } from '../v2/manage/app/appsGet';
import { handleEvent as manageAppDelete } from '../v2/manage/app/delete';
import { handleEvent as manageAppPut } from '../v2/manage/app/put';
import { handleEvent as manageEfficacyPost } from '../v2/manage/reports/efficacyPost';
import { handleEvent as manageReportTimePost } from '../v2/manage/reports/trackingOverTime';
import { handleEvent as manageStudentsGet } from '../v2/manage/license/studentsGet';
import { handleEvent as manageStudentsPut } from '../v2/manage/license/studentsBulkPut';
import { handleEvent as manageTemplateGet } from '../v2/manage/templates/get';
import { handleEvent as manageTemplatePut } from '../v2/manage/templates/put';
import { handleEvent as manageTemplateDelete } from '../v2/manage/templates/delete';

// Student APIs
import { handleEvent as studentInfoGet } from '../v2/student/info/get';
import { handleEvent as studentInfoPut } from '../v2/student/info/put';
import { handleEvent as studentDocumentGet } from '../v2/student/documents/get';
import { handleEvent as studentDocumentPut } from '../v2/student/documents/put';
import { handleEvent as studentDocumentDelete } from '../v2/student/documents/delete';
import { handleEvent as studentSubscriptionsGet } from '../v2/student/subscriptions/get';
import { handleEvent as studentSubscriptionsPut } from '../v2/student/subscriptions/put';
import { handleEvent as studentNotificationGet } from '../v2/student/notification/get';
import { handleEvent as studentNotificationDelete } from '../v2/student/notification/delete';
import { handleEvent as studentBehaviorPut } from '../v2/student/behavior/put';
import { handleEvent as studentBehaviorDelete } from '../v2/student/behavior/delete';
import { handleEvent as studentResponsePut } from '../v2/student/response/put';
import { handleEvent as studentResponseDelete } from '../v2/student/response/delete';
import { handleEvent as studentAbcPut } from '../v2/student/abc/put';
import { handleEvent as studentAbcDelete } from '../v2/student/abc/delete';
import { handleEvent as studentTeamGet } from '../v2/student/team/get';
import { handleEvent as studentTeamPut } from '../v2/student/team/put';
import { handleEvent as studentTeamPost } from '../v2/student/team/post';
import { handleEvent as studentTeamDelete } from '../v2/student/team/delete';
import { handleEvent as studentSchedulesGet } from '../v2/student/schedule/get';
import { handleEvent as studentSchedulePut } from '../v2/student/schedule/put';
import { handleEvent as studentScheduleDelete } from '../v2/student/schedule/delete';

// Report APIs
import { handleEvent as reportSnapshotGet } from '../v2/reports/snapshot/get';
import { handleEvent as reportSnapshotPost } from '../v2/reports/snapshot/post';
import { handleEvent as reportSnapshotPut } from '../v2/reports/snapshot/put';
import { handleEvent as reportSettingsGet } from '../v2/reports/settings/get';
import { handleEvent as reportSettingsPut } from '../v2/reports/settings/put';
import { handleEvent as reportDataGet } from '../v2/reports/data/get';
import { handleEvent as reportDataStatusGet } from '../v2/reports/data/statusGet';
import { handleEvent as reportDataPut } from '../v2/reports/data/put';
import { handleEvent as reportDataDelete } from '../v2/reports/data/delete';
import { handleEvent as reportDataIntervalPut } from '../v2/reports/data/intervalExclude';
import { handleEvent as reportDataDatePut } from '../v2/reports/date/put';
import { handleEvent as reportNotesPut } from '../v2/reports/notes/put';
import { handleEvent as reportNotesPost } from '../v2/reports/notes/post';
import { handleEvent as reportSchedulePut } from '../v2/reports/schedule/put';
import { handleEvent as reportScheduleDelete } from '../v2/reports/schedule/delete';

// License APIs
import { handleEvent as licensePut } from '../v2/licenses/put';
import { handleEvent as licenseDelete } from '../v2/licenses/delete';
import { handleEvent as licensesGet } from '../v2/licenses/getLicenses';
import { handleEvent as licenseDisplayTagsPut } from '../v2/manage/license/displayTagsPut';
import { handleEvent as licenseStudentDelete } from '../v2/manage/license/studentDelete';

// User APIs
import { get as userAlertsGet } from '../v2/user/alertStatsGet';

// Convert Express request to API Gateway event
function toAPIGatewayEvent(req: express.Request): APIGatewayProxyEvent {
    // Extract and validate JWT token
    let claims: Record<string, string> = {
        sub: 'local-test-user',
        'cognito:username': 'local-test-user',
        email: 'test@local.dev'
    };

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7);
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'local-dev-secret');
            
            claims = {
                sub: decoded.sub,
                'cognito:username': decoded.sub,
                email: decoded.email,
                name: decoded.name,
                'cognito:groups': Array.isArray(decoded['cognito:groups']) 
                    ? decoded['cognito:groups'].join(',') 
                    : decoded['cognito:groups'] || ''
            };
        } catch (error) {
            console.warn('JWT validation failed:', error.message);
        }
    }

    return {
        body: req.body ? JSON.stringify(req.body) : null,
        headers: req.headers as any,
        multiValueHeaders: {},
        httpMethod: req.method,
        isBase64Encoded: false,
        path: req.path,
        pathParameters: req.params,
        queryStringParameters: req.query as any,
        multiValueQueryStringParameters: {},
        stageVariables: null,
        requestContext: {
            accountId: 'local',
            apiId: 'local',
            protocol: 'HTTP/1.1',
            httpMethod: req.method,
            path: req.path,
            stage: 'prod',
            requestId: Math.random().toString(36),
            requestTime: new Date().toISOString(),
            requestTimeEpoch: Date.now(),
            authorizer: {
                claims
            },
            identity: {
                sourceIp: req.ip,
                userAgent: req.get('user-agent') || '',
            } as any,
            resourceId: 'local',
            resourcePath: req.path,
        } as any,
        resource: req.path,
    };
}

// Mock Lambda context
const mockContext: Context = {
    functionName: 'local',
    functionVersion: '1',
    invokedFunctionArn: 'local',
    memoryLimitInMB: '1024',
    awsRequestId: 'local',
    logGroupName: 'local',
    logStreamName: 'local',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
    callbackWaitsForEmptyEventLoop: false,
};

// Helper to handle Lambda responses
async function handleLambda(handler: any, req: express.Request, res: express.Response) {
    try {
        const event = toAPIGatewayEvent(req);
        const result = await handler(event, mockContext, () => {});
        
        res.status(parseInt(result.statusCode || '200'));
        if (result.headers) {
            Object.entries(result.headers).forEach(([key, value]) => {
                res.setHeader(key, value as string);
            });
        }
        res.send(result.body);
    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ error: error.message });
    }
}

// Auth routes
app.get('/auth/saml/login', async (req, res) => {
    try {
        const loginUrl = await SAMLHandler.getLoginUrl();
        res.redirect(loginUrl);
    } catch (error) {
        console.error('SAML login error:', error);
        res.status(500).json({ error: 'Failed to initiate SAML login' });
    }
});

app.post('/auth/saml/callback', async (req, res) => {
    try {
        const samlResponse = req.body.SAMLResponse;
        
        if (!samlResponse) {
            return res.status(400).json({ error: 'Missing SAML response' });
        }

        // Validate SAML and generate JWT
        const result = await SAMLHandler.validateAndGenerateToken(samlResponse);

        if (!result) {
            // Fallback for local testing without real SAML
            if (process.env.NODE_ENV === 'development' || process.env.USE_LOCAL === 'true') {
                const userId = req.body.userId || 'test-user';
                const email = req.body.email || 'test@local.dev';
                const name = req.body.name || 'Test User';
                const groups = req.body.groups || [];
                
                const { token, refreshToken } = await AuthManager.generateToken(userId, email, name, groups);
                
                return res.json({
                    success: true,
                    token,
                    refreshToken,
                    expiresIn: 28800,
                    user: { userId, email, name }
                });
            }
            
            return res.status(401).json({ error: 'SAML authentication failed' });
        }

        res.json({
            success: true,
            token: result.token,
            refreshToken: result.refreshToken,
            expiresIn: 28800,
            user: result.user
        });
    } catch (error) {
        console.error('SAML callback error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

app.post('/auth/token/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ error: 'Missing refresh token' });
        }

        const tokens = await AuthManager.refreshToken(refreshToken);
        
        if (!tokens) {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }

        res.json({
            success: true,
            token: tokens.token,
            refreshToken: tokens.refreshToken,
            expiresIn: 28800
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

app.post('/auth/token/validate', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(400).json({ error: 'Missing token' });
        }

        const payload = await AuthManager.validateToken(token);
        
        if (!payload) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        res.json({
            valid: true,
            user: {
                userId: payload.sub,
                email: payload.email,
                name: payload.name
            }
        });
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

app.post('/auth/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
            const payload = await AuthManager.validateToken(token);
            if (payload) {
                await AuthManager.revokeToken(payload.sub);
            }
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Student device routes
app.get('/api/v2/student/devices', (req, res) => handleLambda(devicesGet, req, res));
app.put('/api/v2/student/devices/app', (req, res) => handleLambda(appPut, req, res));
app.delete('/api/v2/student/devices/app', (req, res) => handleLambda(appDelete, req, res));
app.get('/api/v2/student/devices/app/token', (req, res) => handleLambda(appTokenGet, req, res));

// Student device track routes
app.get('/api/v2/student/devices/track', (req, res) => handleLambda(deviceTrackGet, req, res));
app.put('/api/v2/student/devices/track', (req, res) => handleLambda(deviceTrackPut, req, res));
app.delete('/api/v2/student/devices/track', (req, res) => handleLambda(deviceTrackDelete, req, res));
app.get('/api/v2/student/devices/track/term', (req, res) => handleLambda(deviceTrackTermGet, req, res));
app.put('/api/v2/student/devices/track/term', (req, res) => handleLambda(deviceTrackTermPut, req, res));
app.put('/api/v2/student/devices/track/register', (req, res) => handleLambda(deviceTrackRegisterPut, req, res));
app.post('/api/v2/student/devices/track/resync', (req, res) => handleLambda(deviceTrackResyncPost, req, res));
app.get('/api/v2/student/devices/app', (req, res) => handleLambda(deviceAppGet, req, res));
app.get('/api/v2/student/devices/app/qrcode', (req, res) => handleLambda(deviceAppQrCodeGet, req, res));

// Student info routes
app.get('/api/v2/student', (req, res) => handleLambda(studentInfoGet, req, res));
app.put('/api/v2/student', (req, res) => handleLambda(studentInfoPut, req, res));
app.get('/prod/api/v2/student', (req, res) => handleLambda(studentInfoGet, req, res));
app.put('/prod/api/v2/student', (req, res) => handleLambda(studentInfoPut, req, res));

// Student document routes
app.get('/api/v2/student/document', (req, res) => handleLambda(studentDocumentGet, req, res));
app.put('/api/v2/student/document', (req, res) => handleLambda(studentDocumentPut, req, res));
app.delete('/api/v2/student/document', (req, res) => handleLambda(studentDocumentDelete, req, res));
app.get('/prod/api/v2/student/document', (req, res) => handleLambda(studentDocumentGet, req, res));
app.put('/prod/api/v2/student/document', (req, res) => handleLambda(studentDocumentPut, req, res));
app.delete('/prod/api/v2/student/document', (req, res) => handleLambda(studentDocumentDelete, req, res));

// Student subscription routes
app.get('/api/v2/student/subscriptions', (req, res) => handleLambda(studentSubscriptionsGet, req, res));
app.put('/api/v2/student/subscriptions', (req, res) => handleLambda(studentSubscriptionsPut, req, res));
app.get('/prod/api/v2/student/subscriptions', (req, res) => handleLambda(studentSubscriptionsGet, req, res));
app.put('/prod/api/v2/student/subscriptions', (req, res) => handleLambda(studentSubscriptionsPut, req, res));

// Student notification routes
app.get('/api/v2/student/notification', (req, res) => handleLambda(studentNotificationGet, req, res));
app.delete('/api/v2/student/notification', (req, res) => handleLambda(studentNotificationDelete, req, res));
app.get('/prod/api/v2/student/notification', (req, res) => handleLambda(studentNotificationGet, req, res));
app.delete('/prod/api/v2/student/notification', (req, res) => handleLambda(studentNotificationDelete, req, res));

// Student behavior routes
app.put('/api/v2/student/behavior', (req, res) => handleLambda(studentBehaviorPut, req, res));
app.delete('/api/v2/student/behavior', (req, res) => handleLambda(studentBehaviorDelete, req, res));
app.put('/prod/api/v2/student/behavior', (req, res) => handleLambda(studentBehaviorPut, req, res));
app.delete('/prod/api/v2/student/behavior', (req, res) => handleLambda(studentBehaviorDelete, req, res));

// Student response routes
app.put('/api/v2/student/response', (req, res) => handleLambda(studentResponsePut, req, res));
app.delete('/api/v2/student/response', (req, res) => handleLambda(studentResponseDelete, req, res));
app.put('/prod/api/v2/student/response', (req, res) => handleLambda(studentResponsePut, req, res));
app.delete('/prod/api/v2/student/response', (req, res) => handleLambda(studentResponseDelete, req, res));

// Student ABC routes
app.put('/api/v2/student/abc', (req, res) => handleLambda(studentAbcPut, req, res));
app.delete('/api/v2/student/abc', (req, res) => handleLambda(studentAbcDelete, req, res));
app.put('/prod/api/v2/student/abc', (req, res) => handleLambda(studentAbcPut, req, res));
app.delete('/prod/api/v2/student/abc', (req, res) => handleLambda(studentAbcDelete, req, res));

// Student team routes
app.get('/api/v2/student/team', (req, res) => handleLambda(studentTeamGet, req, res));
app.put('/api/v2/student/team', (req, res) => handleLambda(studentTeamPut, req, res));
app.post('/api/v2/student/team', (req, res) => handleLambda(studentTeamPost, req, res));
app.delete('/api/v2/student/team', (req, res) => handleLambda(studentTeamDelete, req, res));
app.get('/prod/api/v2/student/team', (req, res) => handleLambda(studentTeamGet, req, res));
app.put('/prod/api/v2/student/team', (req, res) => handleLambda(studentTeamPut, req, res));
app.post('/prod/api/v2/student/team', (req, res) => handleLambda(studentTeamPost, req, res));
app.delete('/prod/api/v2/student/team', (req, res) => handleLambda(studentTeamDelete, req, res));

// Student schedule routes
app.get('/api/v2/student/schedules', (req, res) => handleLambda(studentSchedulesGet, req, res));
app.put('/api/v2/student/schedule', (req, res) => handleLambda(studentSchedulePut, req, res));
app.delete('/api/v2/student/schedule', (req, res) => handleLambda(studentScheduleDelete, req, res));
app.get('/prod/api/v2/student/schedules', (req, res) => handleLambda(studentSchedulesGet, req, res));
app.put('/prod/api/v2/student/schedule', (req, res) => handleLambda(studentSchedulePut, req, res));
app.delete('/prod/api/v2/student/schedule', (req, res) => handleLambda(studentScheduleDelete, req, res));

// User routes
app.get('/api/v2/user', (req, res) => handleLambda(userGet, req, res));
app.put('/api/v2/user', (req, res) => handleLambda(userPut, req, res));
app.get('/api/v2/user/alerts', (req, res) => handleLambda(userAlertsGet, req, res));
app.get('/prod/api/v2/user', (req, res) => handleLambda(userGet, req, res));
app.put('/prod/api/v2/user', (req, res) => handleLambda(userPut, req, res));
app.get('/prod/api/v2/user/alerts', (req, res) => handleLambda(userAlertsGet, req, res));

// License routes
app.put('/api/v2/license', (req, res) => handleLambda(licensePut, req, res));
app.delete('/api/license', (req, res) => handleLambda(licenseDelete, req, res));
app.get('/api/v2/licenses', (req, res) => handleLambda(licensesGet, req, res));
app.put('/api/v2/license/displaytags', (req, res) => handleLambda(licenseDisplayTagsPut, req, res));
app.delete('/api/v2/license/student', (req, res) => handleLambda(licenseStudentDelete, req, res));
app.put('/prod/api/v2/license', (req, res) => handleLambda(licensePut, req, res));
app.delete('/prod/api/license', (req, res) => handleLambda(licenseDelete, req, res));
app.get('/prod/api/v2/licenses', (req, res) => handleLambda(licensesGet, req, res));
app.put('/prod/api/v2/license/displaytags', (req, res) => handleLambda(licenseDisplayTagsPut, req, res));
app.delete('/prod/api/v2/license/student', (req, res) => handleLambda(licenseStudentDelete, req, res));

// Report routes
app.get('/api/v2/reports/snapshot', (req, res) => handleLambda(reportSnapshotGet, req, res));
app.post('/api/v2/reports/snapshot', (req, res) => handleLambda(reportSnapshotPost, req, res));
app.put('/api/v2/reports/snapshot', (req, res) => handleLambda(reportSnapshotPut, req, res));
app.get('/prod/api/v2/reports/snapshot', (req, res) => handleLambda(reportSnapshotGet, req, res));
app.post('/prod/api/v2/reports/snapshot', (req, res) => handleLambda(reportSnapshotPost, req, res));
app.put('/prod/api/v2/reports/snapshot', (req, res) => handleLambda(reportSnapshotPut, req, res));

app.get('/api/v2/reports/settings', (req, res) => handleLambda(reportSettingsGet, req, res));
app.put('/api/v2/reports/settings', (req, res) => handleLambda(reportSettingsPut, req, res));
app.get('/prod/api/v2/reports/settings', (req, res) => handleLambda(reportSettingsGet, req, res));
app.put('/prod/api/v2/reports/settings', (req, res) => handleLambda(reportSettingsPut, req, res));

app.get('/api/v2/reports/data', (req, res) => handleLambda(reportDataGet, req, res));
app.put('/api/v2/reports/data', (req, res) => handleLambda(reportDataPut, req, res));
app.delete('/api/v2/reports/data', (req, res) => handleLambda(reportDataDelete, req, res));
app.get('/prod/api/v2/reports/data', (req, res) => handleLambda(reportDataGet, req, res));
app.put('/prod/api/v2/reports/data', (req, res) => handleLambda(reportDataPut, req, res));
app.delete('/prod/api/v2/reports/data', (req, res) => handleLambda(reportDataDelete, req, res));

app.get('/api/v2/reports/data/status', (req, res) => handleLambda(reportDataStatusGet, req, res));
app.get('/prod/api/v2/reports/data/status', (req, res) => handleLambda(reportDataStatusGet, req, res));

app.put('/api/v2/reports/data/interval', (req, res) => handleLambda(reportDataIntervalPut, req, res));
app.put('/prod/api/v2/reports/data/interval', (req, res) => handleLambda(reportDataIntervalPut, req, res));

app.put('/api/v2/reports/data/date', (req, res) => handleLambda(reportDataDatePut, req, res));
app.put('/prod/api/v2/reports/data/date', (req, res) => handleLambda(reportDataDatePut, req, res));

app.put('/api/v2/reports/notes', (req, res) => handleLambda(reportNotesPut, req, res));
app.post('/api/v2/reports/notes', (req, res) => handleLambda(reportNotesPost, req, res));
app.put('/prod/api/v2/reports/notes', (req, res) => handleLambda(reportNotesPut, req, res));
app.post('/prod/api/v2/reports/notes', (req, res) => handleLambda(reportNotesPost, req, res));

app.put('/api/v2/reports/schedule', (req, res) => handleLambda(reportSchedulePut, req, res));
app.delete('/api/v2/reports/schedule', (req, res) => handleLambda(reportScheduleDelete, req, res));
app.put('/prod/api/v2/reports/schedule', (req, res) => handleLambda(reportSchedulePut, req, res));
app.delete('/prod/api/v2/reports/schedule', (req, res) => handleLambda(reportScheduleDelete, req, res));

// Manage routes
app.put('/api/v2/manage/abc', (req, res) => handleLambda(manageAbcPut, req, res));
app.put('/prod/api/v2/manage/abc', (req, res) => handleLambda(manageAbcPut, req, res));
app.get('/api/v2/license', (req, res) => handleLambda(manageLicenseGet, req, res));
app.get('/prod/api/v2/license', (req, res) => handleLambda(manageLicenseGet, req, res));
app.get('/api/v2/manage/stats', (req, res) => handleLambda(manageStatsGet, req, res));
app.get('/prod/api/v2/manage/stats', (req, res) => handleLambda(manageStatsGet, req, res));
app.put('/api/v2/license/student', (req, res) => handleLambda(manageLicenseStudentPut, req, res));
app.put('/prod/api/v2/license/student', (req, res) => handleLambda(manageLicenseStudentPut, req, res));
app.get('/api/v2/manage/apps', (req, res) => handleLambda(manageAppsGet, req, res));
app.get('/prod/api/v2/manage/apps', (req, res) => handleLambda(manageAppsGet, req, res));
app.delete('/api/v2/manage/app', (req, res) => handleLambda(manageAppDelete, req, res));
app.delete('/prod/api/v2/manage/app', (req, res) => handleLambda(manageAppDelete, req, res));
app.put('/api/v2/manage/app', (req, res) => handleLambda(manageAppPut, req, res));
app.put('/prod/api/v2/manage/app', (req, res) => handleLambda(manageAppPut, req, res));
app.post('/api/v2/manage/efficacy', (req, res) => handleLambda(manageEfficacyPost, req, res));
app.post('/prod/api/v2/manage/efficacy', (req, res) => handleLambda(manageEfficacyPost, req, res));
app.post('/api/v2/manage/report/time', (req, res) => handleLambda(manageReportTimePost, req, res));
app.post('/prod/api/v2/manage/report/time', (req, res) => handleLambda(manageReportTimePost, req, res));
app.get('/api/v2/manage/students', (req, res) => handleLambda(manageStudentsGet, req, res));
app.get('/prod/api/v2/manage/students', (req, res) => handleLambda(manageStudentsGet, req, res));
app.put('/api/v2/manage/students', (req, res) => handleLambda(manageStudentsPut, req, res));
app.put('/prod/api/v2/manage/students', (req, res) => handleLambda(manageStudentsPut, req, res));
app.get('/api/v2/manage/templates', (req, res) => handleLambda(manageTemplateGet, req, res));
app.get('/prod/api/v2/manage/templates', (req, res) => handleLambda(manageTemplateGet, req, res));
app.put('/api/v2/manage/template', (req, res) => handleLambda(manageTemplatePut, req, res));
app.put('/prod/api/v2/manage/template', (req, res) => handleLambda(manageTemplatePut, req, res));
app.delete('/api/v2/manage/template', (req, res) => handleLambda(manageTemplateDelete, req, res));
app.delete('/prod/api/v2/manage/template', (req, res) => handleLambda(manageTemplateDelete, req, res));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'rest-api' });
});

// 404 handler - log missing paths
app.use((req, res, next) => {
    console.error(`[404] Missing endpoint: ${req.method} ${req.path}`);
    res.status(404).json({ error: 'Not Found', path: req.path, method: req.method });
});

const PORT = process.env.REST_PORT || 3000;
app.listen(PORT, () => {
    console.log(`REST API server running on http://localhost:${PORT}`);
});
