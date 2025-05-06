import { WebUtils } from "@mytaptrack/lib";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";
import { send, SUCCESS, FAILED } from 'cfn-response';
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

export const handler = WebUtils.lambdaWrapper(eventHandler);

async function eventHandler(event: CloudFormationCustomResourceEvent, context: Context) {
    console.log(JSON.stringify(event));
    try {
        if(event.RequestType == 'Delete') {
            return send(event, context, SUCCESS, {});
        }

        console.log('Getting bucket details', event.ResourceProperties.SourceBucket);
        let nextToken;

        do {
            console.log('Listing objects', nextToken);
            const items = await s3.send(new ListObjectsCommand({
                Bucket: event.ResourceProperties.SourceBucket,
                Marker: nextToken
            }));
            nextToken = items.Marker;
            if(items.Contents) {
                console.log('Copying objects');
                for(let x of items.Contents) {
                    console.log('Copying', x.Key);
                    try {
                        await s3.send(new CopyObjectCommand({
                            Bucket: event.ResourceProperties.DestinationBucket,
                            Key: x.Key,
                            CopySource: `/${event.ResourceProperties.SourceBucket}/${x.Key}`,
                            ServerSideEncryption: 'AES256'
                        }));
                    } catch (err) {
                        if(err.code != 'AccessDenied') {
                            throw err;
                        }
                    }
                }

                console.log('DeletingObjects');
                await Promise.all(items.Contents.map(x => s3.send(new DeleteObjectCommand({
                    Bucket: event.ResourceProperties.SourceBucket,
                    Key: x.Key
                }))));
            }
        } while(nextToken);
        await send(event, context, SUCCESS, { }, event.ResourceProperties.DestinationBucket);
    } catch (err) {
        console.log(err);
        WebUtils.setError(err);
        await send(event, context, FAILED, {Error: `Error retrieving information, ${JSON.stringify(err)}` } );
    }
}