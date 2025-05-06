import { RemoveStudentInput } from '../../../library';
import { WebUtils } from '@mytaptrack/lib';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand} from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const stepfunction = new SFNClient();

export const proc = WebUtils.lambdaWrapper(handler);

export async function handler() {
    let token;
    do {
        const results = await dynamodb.send(new ScanCommand({
            TableName: process.env.StudentTable
        }));
        token = results.LastEvaluatedKey;

        await Promise.all(results.Items!.map(async x => {
            const team = await dynamodb.send(new QueryCommand({
                TableName: process.env.TeamTable,
                KeyConditionExpression: 'studentId = :studentId',
                ExpressionAttributeValues: {
                    ':studentId': x.studentId
                }
            }));

            if(team.Items!.filter(x => !x.removed).length === 0) {
                await stepfunction.send(new StartExecutionCommand({
                    stateMachineArn: process.env.studentFinalRemoveArn,
                    input: JSON.stringify({
                        studentId: x.studentId
                    } as RemoveStudentInput)
                }));
            }
        }));
    } while (token);
}
