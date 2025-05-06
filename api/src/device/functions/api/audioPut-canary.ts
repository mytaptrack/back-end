import { WebUtils } from '@mytaptrack/lib';
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as https from 'https';

const s3 = new S3Client();

export const handleEvent = WebUtils.lambdaWrapper(handler);

async function handler() {
    const data = await s3.send(new GetObjectCommand({
        Bucket: process.env.voiceBucket,
        Key: 'test/dsn/M21343B210000010'
    }));
    const buffer = Buffer.from(await data.Body.transformToString('utf-8'), 'base64');

    await new Promise<void>((resolve, reject) => {
        const request = https.request({
            host: 'device.mytaptrack-test.com',
            path: '/test/audio',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet',
                'dsn': 'M21343B210000010',
                'x-api-key': 'fsIuZZfcAdQAG1zyiIeJ7Kg6cxneu8a7jciPrM1f',
                'Content-Length': 352004
            }
        }, (res) => {
            console.log('Received response');
            res.on('error', (err) => {
                console.log(err);
                reject(err);
            })
            res.on('end', () => {
                console.log('Completed call');
                resolve();
            });
        });
        request.on('error', (err) => {
            console.log(err);
            reject(err);
        });

        console.log('Writing data');
        request.write(buffer);
        request.end();
    });
}