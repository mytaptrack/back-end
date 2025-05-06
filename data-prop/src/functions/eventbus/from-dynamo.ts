import { WebUtils, v2 } from "@mytaptrack/lib";
import { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventbus = new EventBridgeClient({});

interface MttEvent {
    type: v2.MttEventType;
    data: any;
}

export const handler = WebUtils.lambdaWrapper(eventHandler);

async function eventHandler(event: DynamoDBStreamEvent) {
    WebUtils.logObjectDetails(event);
    const records = (await Promise.all(event.Records.map(record => {
        return constructMessage(
            record.dynamodb?.NewImage? unmarshall(record.dynamodb!.NewImage as any) as any : undefined,
            record.dynamodb?.OldImage? unmarshall(record.dynamodb!.OldImage as any) as any : undefined);
    }))).filter(x => x && x.type);

    if(records.length > 0) {
        console.log('Putting events', records.map(x => x!.type));
        console.debug('Event:', records);
        for(let i = 0; i < 5; i += 5) {
            const segment = records.slice(i, i + 5);
            await eventbus.send(new PutEventsCommand({
                Entries: segment.map(r => ({
                    EventBusName: process.env.EVENT_BUS,
                    Source: 'DynamoDB',
                    DetailType: r!.type,
                    Detail: JSON.stringify(r)
                }))
            }));                
        }
    } else {
        console.log('No events to put');
    }
}

function constructMessage(newData: { pk: string, sk: string }, oldData: { pk: string, sk: string }): v2.MttUpdateEvent<any> | undefined {
    let type: v2.MttEventType = v2.MttEventType.a;
    const data = newData ?? oldData;
    console.log('pk', newData?.pk, ', sk', newData?.sk);
    if(!data || !data.pk) {
        console.log('Skipping record');
        return;
    }
    console.log('Processing pk match');
    if (data.pk.match(/^U\#[0-9|a-z|\-]+$/)) {
        // User Object Key
        if(data.sk == 'P') {
            type = v2.MttEventType.user;
        } else if (data.sk.match(/^S#[0-9|a-z|\-]+#P$/)) {
            type = v2.MttEventType.team;
        } else if (data.sk.match(/^S#[0-9|a-z|\-]+#D$/)) {
            type = v2.MttEventType.da;
        } else if (data.sk.match(/^S#[0-9|a-z|\-]+#NS$/)) {
            type = v2.MttEventType.ns;
        } else if (data.sk.match(/^S#[0-9|a-z|\-]+#DN#[0-9|a-z|T|\:|\-]+$/)) {
            type = v2.MttEventType.dn;
        } else if (data.sk.match(/^S#[0-9|a-z|\-]+#I+$/)) {
            type = v2.MttEventType.i;
        }
    } else if (data.pk.match(/^S\#[0-9|a-z|\-]+$/)) {
        // Student Object Key
        if (data.sk == 'P') {
            type = v2.MttEventType.student;
        } else if (data.sk.match(/^B#[0-9|a-z|\-]+#P$/)) {
            type = v2.MttEventType.b;
        } else if (data.sk.match(/^D#[0-9|a-z|\-]+#R$/)) {
            type = v2.MttEventType.b;
            delete (newData as any).data;
            delete (oldData as any).data;
        } else if (data.sk.match(/^A#[0-9|a-z|\-]+#P$/)) {
            type = v2.MttEventType.a;
        } else if (data.sk.match(/^AS#[0-9|a-z|\-]+#P$/)) {
            type = v2.MttEventType.as;
        } else if (data.sk.match(/^B#[0-9|a-z|\-]+#NU#[0-9|\-]+$/)) {
            type = v2.MttEventType.nu;
        } else if (data.sk.match(/^B#[0-9|a-z|\-]+#NA#[0-9|\-]+$/)) {
            type = v2.MttEventType.na;
        }
    } else if (data.pk.match(/^L\#[0-9|a-z|\-]+$/) && data.sk.match(/^GD\#[0-9|a-z|\-]+$/)) {
        type = v2.MttEventType.ad;
    } else if (data.pk == 'L') {
        console.log('Checking license subtype')
        if (data.sk.startsWith('P#')) {
            console.log('Setting type to license');
            type = v2.MttEventType.license
        }
    } else if (data.pk.match(/^USN#.+$/)) {
        if(data.sk.startsWith('S#')) {
            type = v2.MttEventType.ns;
        }
    }
    console.log('Type identified', type);
    return {
        type,
        data: {
            new: newData,
            old: oldData
        }
    };
}
