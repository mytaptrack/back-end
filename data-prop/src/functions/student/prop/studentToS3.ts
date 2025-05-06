import { v2, WebUtils, MttEventType } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const s3 = new S3Client({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function reprocessStudents() {
    let token;
    do {
        const output: any = await dynamodb.send(new ScanCommand({
            TableName: process.env.DataTable,
            ExclusiveStartKey: token,
            Limit: 10
        }));
        token = output.LastEvaluatedKey;
        await Promise.all((output.Items! as v2.StudentConfigStorage[]).map(async config => {
            if(config.sk == 'P' && config.pk.match(/^S\#[0-9|a-z|\-]+$/)) {
                await handler({
                    id: '',
                    version: '',
                    account: '',
                    time: '',
                    region: '',
                    resources: [],
                    "detail-type": 'student-config',
                    source: 'reload',
                    detail: {
                        type: MttEventType.student,
                        data: {
                            new: config,
                            old: undefined as any
                        }
                    }
                });    
            }
        }));
    } while (token);
}

export async function handler(event: EventBridgeEvent<'student-config', v2.MttUpdateEvent<v2.StudentConfigStorage>>) {
    WebUtils.logObjectDetails(event);
    const student = event.detail.data.new ?? event.detail.data.old;

    if(!student) {
        return;
    }
    if(!student.license) {
        return;
    }
    await s3.send(new PutObjectCommand({
        Bucket: process.env.dataBucket,
        Key: `students/plicense=${student.license}/pstudent=${student.studentId}/info.json`,
        Body: JSON.stringify({
            studentId: student.studentId,
            license: student.license,
            licenseDetails: JSON.stringify(student.licenseDetails),
            behaviors: JSON.stringify(student.behaviors),
            responses: JSON.stringify(student.responses),
            lastUpdatedDate: student.lastUpdatedDate,
            lastTracked: student.lastTracked,
            lastActive: student.lastActive,
            archived: student.archived? true : false
        })
    }));
}
