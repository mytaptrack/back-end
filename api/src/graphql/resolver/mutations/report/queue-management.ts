import { WebUtils, MttEventType } from '@mytaptrack/lib';
import {
    QLReportData, QLReportService
} from '@mytaptrack/types';
import { Dal, DalKey } from '@mytaptrack/lib/dist/v2/dals/dal';
import { EventBridgeEvent, SQSEvent } from 'aws-lambda';
import { SQS } from '@aws-sdk/client-sqs';

interface AppSyncParams {
    studentId: string;
    data: QLReportData | QLReportService;
}

const dataDal = new Dal('data');
const sqs = new SQS({});

export const handler = WebUtils.lambdaWrapper(handleEvent);

export async function handleEvent(event: EventBridgeEvent<MttEventType.trackEvent | MttEventType.trackService, AppSyncParams>) {
    console.log('Handling event', event);
    const input = event.detail;
    
    // In local mode, use RabbitMQ instead of SQS
    if (process.env.USE_LOCAL === 'true' || process.env.NODE_ENV === 'development') {
        try {
            const amqp = require('amqplib');
            const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://mytaptrack:mytaptrack@localhost:5672');
            const channel = await connection.createChannel();
            
            const queueName = 'report-data-queue';
            await channel.assertQueue(queueName, { durable: true });
            
            const message = JSON.stringify(input);
            await channel.sendToQueue(queueName, Buffer.from(message), { persistent: true });
            
            console.log('Sent message to RabbitMQ queue:', queueName);
            
            await channel.close();
            await connection.close();
        } catch (error) {
            console.error('Failed to send message to RabbitMQ:', error);
            throw error;
        }
        return;
    }

    await sqs.sendMessage({
        QueueUrl: process.env.DATA_QUEUE_URL,
        MessageBody: JSON.stringify(input),
        MessageGroupId: input.studentId
    });
    console.log('Send message complete');
}
