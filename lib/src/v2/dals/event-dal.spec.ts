/**
 * Unit test stubs: EventBridge vs RabbitMQ routing
 *
 * Documents the contract that EventDal routes to RabbitMQ when USE_LOCAL=true
 * and to EventBridge otherwise.
 *
 * Wave 0 — tests run and assert correct routing. Both behaviors are already
 * implemented so tests should pass once mocking is set up correctly.
 *
 * Note: event-dal.ts uses require('amqplib') dynamically inside sendEvents(), which
 * vi.mock() cannot see, so mockNativeModule seeds the require cache instead.
 * The EventBridgeClient singleton is created at module load time; we mock the
 * constructor to intercept its send() calls.
 */

// vi.mock() calls are hoisted before imports.
const mockConnect = vi.fn();
const mockSendToQueue = vi.fn().mockResolvedValue(undefined);
const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockAssertQueue = vi.fn().mockResolvedValue(undefined);
const mockAssertExchange = vi.fn().mockResolvedValue(undefined);
const mockChannelClose = vi.fn().mockResolvedValue(undefined);
const mockConnectionClose = vi.fn().mockResolvedValue(undefined);

const mockChannel = {
    assertQueue: mockAssertQueue,
    assertExchange: mockAssertExchange,
    sendToQueue: mockSendToQueue,
    publish: mockPublish,
    close: mockChannelClose,
};

const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: mockConnectionClose,
};

const { mockEBSend } = vi.hoisted(() => ({ mockEBSend: vi.fn().mockResolvedValue({}) }));
vi.mock('@aws-sdk/client-eventbridge', () => ({
    EventBridgeClient: vi.fn(function () {
        return { send: mockEBSend, destroy: vi.fn() };
    }),
    PutEventsCommand: vi.fn(function (input) {
        return { input };
    }),
}));

import { MttEventType } from '..';
import { mockNativeModule } from '../testing/native-module-mock';

describe('EventDal', () => {
    let restoreAmqp: () => void;

    beforeEach(() => {
        vi.clearAllMocks();
        restoreAmqp = mockNativeModule('amqplib', { connect: mockConnect }, __dirname);
        mockConnect.mockResolvedValue(mockConnection);
        mockEBSend.mockResolvedValue({});
    });

    afterEach(() => {
        restoreAmqp();
        delete process.env.USE_LOCAL;
        delete process.env.NODE_ENV;
        delete process.env.RABBITMQ_URL;
        delete process.env.EVENT_BUS;
    });

    describe('local mode (USE_LOCAL=true)', () => {
        beforeEach(() => {
            process.env.USE_LOCAL = 'true';
            process.env.RABBITMQ_URL = 'amqp://localhost:5672';
        });

        it('should call amqplib.connect when USE_LOCAL=true', async () => {
            const { EventDal } = await import('./event-dal');
            const event = { type: MttEventType.trackEvent, data: { test: true } };
            await EventDal.sendEvents('test-source', [event]);

            expect(mockConnect).toHaveBeenCalledWith('amqp://localhost:5672');
        });

        it('should NOT call EventBridgeClient.send when USE_LOCAL=true', async () => {
            const { EventDal } = await import('./event-dal');
            const event = { type: MttEventType.trackEvent, data: { test: true } };
            await EventDal.sendEvents('test-source', [event]);

            expect(mockEBSend).not.toHaveBeenCalled();
        });
    });

    describe('AWS mode (USE_LOCAL unset)', () => {
        beforeEach(() => {
            delete process.env.USE_LOCAL;
            delete process.env.NODE_ENV;
            process.env.EVENT_BUS = 'test-event-bus';
        });

        it('should call EventBridgeClient.send when USE_LOCAL is unset', async () => {
            const { EventDal } = await import('./event-dal');
            const event = { type: MttEventType.trackEvent, data: { test: true } };
            await EventDal.sendEvents('test-source', [event]);

            // EventBridgeClient.send is called once with the PutEventsCommand instance
            expect(mockEBSend).toHaveBeenCalledTimes(1);
            // The argument is the result of `new PutEventsCommand(...)` — our mock
            // returns a plain object with `input` property containing the entries.
            const sentArg = mockEBSend.mock.calls[0][0];
            expect(sentArg).toBeDefined();
        });

        it('should NOT call amqplib.connect when USE_LOCAL is unset', async () => {
            const { EventDal } = await import('./event-dal');
            const event = { type: MttEventType.trackEvent, data: { test: true } };
            await EventDal.sendEvents('test-source', [event]);

            expect(mockConnect).not.toHaveBeenCalled();
        });
    });
});
