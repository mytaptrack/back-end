import { v2, WebUtils } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';
import { PutObjectCommand, S3 } from '@aws-sdk/client-s3';

const s3 = new S3();

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<'license', v2.MttUpdateEvent<v2.LicenseStorage>>) {
    WebUtils.logObjectDetails(event);
    const oldLicense = event.detail.data.old;
    const newLicense = event.detail.data.new;

    if(newLicense) {
        await s3.send(new PutObjectCommand({
            Bucket: process.env.dataBucket,
            Key: `licenses/${newLicense.license}.json`,
            Body: JSON.stringify(newLicense)
        }));
    } else {
        await s3.send(new PutObjectCommand({
            Bucket: process.env.dataBucket,
            Key: `licenses/${oldLicense.license}.json`,
            Body: JSON.stringify(oldLicense)
        }));
    }
}
