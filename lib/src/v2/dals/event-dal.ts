import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { MttEvent, MttEventType } from '..';

const eventbus = new EventBridgeClient({});

class EventDalClass {
    async sendEvents<T>(source: string, events: MttEvent<T>[]) {
        // In local mode, use RabbitMQ instead of EventBridge
        if (process.env.USE_LOCAL === 'true' || process.env.NODE_ENV === 'development') {
            try {
                const amqp = require('amqplib');
                const connection = await amqp.connect(process.env.RABBITMQ_URL);
                const channel = await connection.createChannel();
                
                for (const event of events.filter(r => r? true : false)) {
                    // For track events, send directly to report-data-queue
                    if (event.type == MttEventType.trackEvent || event.type == MttEventType.trackService) {
                        const queueName = 'report-data-queue';
                        await channel.assertQueue(queueName, { durable: true });
                        
                        const message = JSON.stringify(event.data);
                        await channel.sendToQueue(queueName, Buffer.from(message), { persistent: true });
                        console.log(`Sent ${event.type} to report-data-queue`);
                    } else {
                        // For other events, use the exchange
                        const exchange = 'mytaptrack-events';
                        await channel.assertExchange(exchange, 'topic', { durable: true });
                        
                        const routingKey = `${source}.${event.type}`;
                        const message = JSON.stringify({
                            source,
                            detailType: event.type,
                            detail: event.data
                        });
                        
                        await channel.publish(exchange, routingKey, Buffer.from(message));
                        console.log(`Published event to RabbitMQ: ${routingKey}`);
                    }
                }
                
                await channel.close();
                await connection.close();
            } catch (error) {
                console.error('Failed to publish events to RabbitMQ:', error);
                // Don't throw - just log the error in local mode
            }
            return;
        }

        await eventbus.send(new PutEventsCommand({
            Entries: events.filter(r => r? true : false).map(r => ({
                EventBusName: process.env.EVENT_BUS,
                Source: source,
                DetailType: r.type,
                Detail: JSON.stringify(r.data)
            }))
        }));
    }
}

export const EventDal = new EventDalClass();
