/**
 * Jest globalSetup for local mode (USE_LOCAL=true).
 *
 * Runs once before all tests. Automatically:
 *   1. Sets DynamoDB/AWS env vars
 *   2. Creates license + user records in local DynamoDB
 *   3. Generates JWT tokens and stores them in Redis
 *      (same format as api/src/container/auth-manager.ts)
 *
 * This means `npm run test:local` works without any prior `envSetup` step.
 */

'use strict';

const path = require('path');

const LICENSE_NUMBER = '000000-000000-000000';
const JWT_SECRET_DEFAULT = 'local-dev-secret';
const TOKEN_EXPIRY_SECS = 8 * 60 * 60;   // 8 hours
const REFRESH_EXPIRY_SECS = 24 * 60 * 60; // 24 hours

const FALLBACK_USERS = [
    { email: 'teacher@mytaptrack.com', name: 'Teacher User' },
    { email: 'parent@mytaptrack.com', name: 'Parent User' },
];

module.exports = async function globalSetup() {
    if (process.env.USE_LOCAL !== 'true') return;

    // Load back-end/.env first so STAGE, REDIS_HOST, etc. are available.
    // This mirrors what config.ts does via dotenv in the test workers.
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

    console.log('\n[Global Setup] Initializing local test environment...');

    // ── Set env vars BEFORE any lib require() calls ────────────────────────
    process.env.DYNAMODB_ENDPOINT        = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
    // Must stay in sync with system-tests/src/jest.setup.ts USE_LOCAL=true block
    process.env.PrimaryTable             = 'mytaptrack-local-primary';
    process.env.DataTable                = 'mytaptrack-local-data';
    process.env.USE_DATABASE_ABSTRACTION = 'false';
    process.env.DB_TYPE                  = 'dynamodb';
    process.env.AWS_ACCESS_KEY_ID        = process.env.AWS_ACCESS_KEY_ID || 'local';
    process.env.AWS_SECRET_ACCESS_KEY    = process.env.AWS_SECRET_ACCESS_KEY || 'local';
    process.env.AWS_REGION               = process.env.AWS_REGION || 'us-east-1';
    process.env.STRONGLY_CONSISTENT_READ = 'true';

    const licenseNumber = process.env.License || LICENSE_NUMBER;
    const users = loadTestUsers();

    await setupDynamoDB(licenseNumber, users);
    await setupRedisTokens(licenseNumber, users);

    console.log('[Global Setup] ✓ Local environment ready.\n');
};

// ── Config loading ────────────────────────────────────────────────────────────

function loadTestUsers() {
    try {
        const { ConfigFile } = require('@mytaptrack/cdk');
        // Mirror config.ts exactly: CONFIG_PATH ?? '../config' resolved from CWD
        // CWD when Jest runs globalSetup = system-tests/, so '../config' = back-end/config/
        const configDir = process.env.CONFIG_PATH ?? '../config';
        const stage = process.env.STAGE || 'dev';

        const cf = new ConfigFile(configDir, stage);
        const testing = cf.config?.env?.testing;
        if (testing?.admin?.email) {
            console.log(`[Global Setup] Loaded test users (${stage})`);
            return [testing.admin, testing.nonadmin].filter(Boolean);
        }
    } catch {
        // @mytaptrack/cdk not resolvable or config missing — use defaults
    }

    console.log('[Global Setup] Using default test users');
    return FALLBACK_USERS;
}

// ── DynamoDB setup ────────────────────────────────────────────────────────────

async function setupDynamoDB(licenseNumber, users) {
    // Require AFTER env vars are set so the Dal picks up the right endpoint
    const { UserDal, LicenseDal } = require('@mytaptrack/lib');

    await LicenseDal.save({
        license: licenseNumber,
        customer: 'System Tests',
        singleCount: 100,
        singleUsed: 0,
        multiCount: 100,
        admins: users.map(u => u.email),
        emailDomain: '',
        start: '05/18/2018',
        expiration: '05/18/3000',
        features: {
            snapshot: true, dashboard: true, browserTracking: true,
            download: true, manage: true, supportChanges: true,
            schedule: true, devices: true, duration: true,
            behaviorTargets: true, response: true,
            emailTextNotifications: true, abc: true,
            notifications: true, appGroups: true, documents: true,
            intervalWBaseline: true, serviceTracking: true,
            behaviorTracking: true, serviceProgress: true,
            intensity: 5,
        },
        tags: { devices: [] },
    });
    console.log(`[Global Setup] ✓ License ready: ${licenseNumber}`);

    for (const user of users) {
        const userId = user.email.replace('@', '-at-');
        const nameParts = user.name.split(' ');

        await UserDal.saveUserPii(userId, licenseNumber, {
            name: user.name,
            firstName: nameParts[0],
            lastName: nameParts.length > 1 ? nameParts[1] : nameParts[0],
            email: user.email,
            state: 'WA',
            zip: '99999',
        });

        await UserDal.saveUserConfig(userId, { license: licenseNumber, tags: [] });
        console.log(`[Global Setup] ✓ DynamoDB records ready: ${user.email}`);
    }
}

// ── Redis token setup ─────────────────────────────────────────────────────────
// Mirrors the exact token format used by api/src/container/auth-manager.ts so
// that cognito.ts login() in local mode can retrieve a valid Bearer token.

async function setupRedisTokens(licenseNumber, users) {
    const jwt   = require('jsonwebtoken');
    const Redis = require('ioredis');

    const jwtSecret = process.env.JWT_SECRET || JWT_SECRET_DEFAULT;

    const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        retryStrategy: (times) => (times > 4 ? null : Math.min(times * 100, 2000)),
        lazyConnect: true,
        enableOfflineQueue: false,
    });

    redis.on('error', () => {}); // suppress unhandled-error noise

    try {
        await Promise.race([
            redis.connect(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 5000)
            ),
        ]);
    } catch (err) {
        console.warn(`[Global Setup] Redis not available (${err.message}). Tests requiring auth will fail.`);
        redis.disconnect();
        return;
    }

    for (const user of users) {
        const userId = user.email.replace('@', '-at-');
        const groups = [`licenses/${licenseNumber}`];

        const token = jwt.sign(
            { sub: userId, email: user.email, name: user.name, 'cognito:groups': groups },
            jwtSecret,
            { expiresIn: TOKEN_EXPIRY_SECS }
        );

        const refreshToken = jwt.sign(
            { sub: userId },
            jwtSecret,
            { expiresIn: REFRESH_EXPIRY_SECS }
        );

        // Identity structure must match auth-manager.ts exactly
        const identity = {
            sub: userId,
            username: userId,
            email: user.email,
            name: user.name,
            'cognito:username': userId,
            'cognito:groups': groups,
            groups,
            cognitoIdentityAuthProvider: null,
        };

        await redis.setex(`token:${userId}`,    TOKEN_EXPIRY_SECS,   token);
        await redis.setex(`refresh:${userId}`,  REFRESH_EXPIRY_SECS, refreshToken);
        await redis.setex(`identity:${userId}`, TOKEN_EXPIRY_SECS,   JSON.stringify(identity));

        console.log(`[Global Setup] ✓ Token ready: ${user.email}`);
    }

    await redis.quit();
}
