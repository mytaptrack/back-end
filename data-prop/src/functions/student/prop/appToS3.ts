import { v2, WebUtils, MttEventType, AppConfigStorage } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DalKey } from '@mytaptrack/lib/dist/v2/dals/dal';

const s3 = new S3Client({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));


export interface LicenseAppConfigStorageBehaviorItem {
    id: string;
    abc?: boolean;
    order: number;
}

export interface LicenseAppConfigStorageServiceItem {
    id: string;
    order: number;
}

export interface LicenseAppConfigStorageStudent {
    studentId: string;
    behaviors: LicenseAppConfigStorageBehaviorItem[];
    services: LicenseAppConfigStorageServiceItem[];
    deleted?: {
        by: string;
        date: number;
        client: 'Web' | 'App'
    };
}

export interface LicenseAppConfigStorage extends DalKey {
    pk: string;
    sk: string;
    pksk: string;
    deviceId: string;
    dsk: string;
    license: string;
    auth: string[];
    deleted?: {
        by: string;
        date: number;
        client: 'Web' | 'App'
    };
    textAlerts: boolean;
    timezone: string;
    students: LicenseAppConfigStorageStudent[];
    studentIds: string[];
    qrExpiration?: number;
}

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function reprocessStudents() {
    let token;
    do {
        const result: any = await dynamodb.send(new ScanCommand({
            TableName: process.env.DataTable,
            ExclusiveStartKey: token,
            Limit: 10
        }));
        token = result.LastEvaluatedKey;
        await Promise.all((result.Items as LicenseAppConfigStorage[]).map(async config => {
            if(config.pk.match(/^S\#[0-9|a-z|\-]+$/) && config.sk.match(/^AS#[0-9|a-z|\-]+#P$/)) {
                await handler({
                    id: '',
                    version: '',
                    account: '',
                    time: '',
                    region: '',
                    resources: [],
                    "detail-type": MttEventType.as,
                    source: 'reload',
                    detail: {
                        type: MttEventType.as,
                        data: {
                            new: config,
                            old: undefined as any
                        }
                    }
                })    
            }
        }));
    } while (token);
}

export async function handler(event: EventBridgeEvent<MttEventType.as, v2.MttUpdateEvent<LicenseAppConfigStorage>>) {
    console.debug('Event:', event);
    const device: LicenseAppConfigStorage = event.detail.data.new ?? event.detail.data.old;

    if(!device) {
        return;
    }
    if(!device.license) {
        return;
    }

    await Promise.all((device.students ?? []).map(async app => {
        await s3.send(new PutObjectCommand({
            Bucket: process.env.dataBucket,
            Key: `apps/plicense=${device.license}/pstudent=${app.studentId}/${device.deviceId}-${app.studentId}.json`,
            Body: JSON.stringify({
                appId: `${device.deviceId}-${app.studentId}`,
                studentId: app.studentId,
                license: device.license,
                deviceId: device.deviceId,
                deleted: app.deleted? true : false,
                generatingUserId: '',
                behaviors: JSON.stringify(app.behaviors),
                groupCount: 0,
                timezone: device.timezone
            })
        }))
    }));
}
