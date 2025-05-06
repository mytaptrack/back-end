import { WebUtils } from "@mytaptrack/lib";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { CloudWatchLogsClient, DescribeLogGroupsCommand, AssociateKmsKeyCommand } from "@aws-sdk/client-cloudwatch-logs";

const cloudwatch = new CloudWatchLogsClient({});

export const handler = WebUtils.lambdaWrapper(eventHandler);

async function eventHandler(event: CloudFormationCustomResourceEvent, context: Context) {
    console.log(JSON.stringify(event));
    try {
        let nextToken;

        do {
            console.log('Getting logs', nextToken);
            const logGroupResults = await cloudwatch.send(new DescribeLogGroupsCommand({
                nextToken
            }));
            nextToken = logGroupResults.nextToken;
            
            console.log('Processing log groups');
            for(let group of logGroupResults.logGroups) {
                if(!group.kmsKeyId) {
                    console.log('Setting kms id', group.logGroupName, process.env.kmsKeyId);
                    await cloudwatch.send(new AssociateKmsKeyCommand({
                        logGroupName: group.logGroupName,
                        kmsKeyId: process.env.kmsKeyId,
                    }));
                }
            }
        } while(nextToken);
        console.log('Processing complete')
    } catch (err) {
        console.log(err);
        WebUtils.setError(err);
        throw err;
    }
}