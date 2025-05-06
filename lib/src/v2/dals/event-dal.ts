import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { MttEvent } from '..';

const eventbus = new EventBridgeClient({});

class EventDalClass {
    async sendEvents<T>(source: string, events: MttEvent<T>[]) {
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
