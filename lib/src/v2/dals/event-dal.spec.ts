/**
 * Unit test stubs: EventBridge vs RabbitMQ routing
 *
 * Documents the contract that EventDal routes to RabbitMQ when USE_LOCAL=true
 * and to EventBridge otherwise.
 *
 * Wave 0 — tests run and assert correct routing. Both behaviors are already
 * implemented so tests should pass once mocking is set up correctly.
 *
 * Note: event-dal.ts uses require('amqplib') dynamically inside sendEvents().
 * jest.mock() intercepts dynamic require() calls so the mock is in effect.
 * The EventBridgeClient singleton is created at module load time; we mock the
 * constructor to intercept its send() calls.
 */

// jest.mock() calls are hoisted before imports.
const mockConnect = jest.fn();
const mockSendToQueue = jest.fn().mockResolvedValue(undefined);
const mockPublish = jest.fn().mockResolvedValue(undefined);
const mockAssertQueue = jest.fn().mockResolvedValue(undefined);
const mockAssertExchange = jest.fn().mockResolvedValue(undefined);
const mockChannelClose = jest.fn().mockResolvedValue(undefined);
const mockConnectionClose = jest.fn().mockResolvedValue(undefined);

const mockChannel = {
    assertQueue: mockAssertQueue,
    assertExchange: mockAssertExchange,
    sendToQueue: mockSendToQueue,
    publish: mockPublish,
    close: mockChannelClose,
};

const mockConnection = {
    createChannel: jest.fn().mockResolvedValue(mockChannel),
    close: mockConnectionClose,
};

jest.mock('amqplib', () => ({
    connect: mockConnect,
}));

const mockEBSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-eventbridge', () => ({
    EventBridgeClient: jest.fn().mockImplementation(() => ({
        send: mockEBSend,
        destroy: jest.fn(),
    })),
    PutEventsCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { MttEventType } from '..';

describe('EventDal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockConnect.mockResolvedValue(mockConnection);
        mockEBSend.mockResolvedValue({});
    });

    afterEach(() => {
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
            const { EventDal } = require('./event-dal');
            const event = { type: MttEventType.trackEvent, data: { test: true } };
            await EventDal.sendEvents('test-source', [event]);

            expect(mockConnect).toHaveBeenCalledWith('amqp://localhost:5672');
        });

        it('should NOT call EventBridgeClient.send when USE_LOCAL=true', async () => {
            const { EventDal } = require('./event-dal');
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
            const { EventDal } = require('./event-dal');
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
            const { EventDal } = require('./event-dal');
            const event = { type: MttEventType.trackEvent, data: { test: true } };
            await EventDal.sendEvents('test-source', [event]);

            expect(mockConnect).not.toHaveBeenCalled();
        });
    });
});
