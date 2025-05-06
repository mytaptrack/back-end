import { APIGatewayEvent } from 'aws-lambda';
import { WebUtils, v2 } from '@mytaptrack/lib';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Button2UpdateRequest, Button2UpdateResponse } from '../../library';
import { v4 as uuid } from 'uuid';
import { get } from '@mytaptrack/get-ssl-certificate';

let s3 = new S3Client({});

export const check = WebUtils.lambdaWrapper(handler);

export async function handler(event: APIGatewayEvent) {
    WebUtils.logObjectDetails(event);
    event.body = event.body.replace('\u0001', '');
    const request = JSON.parse(event.body) as Button2UpdateRequest;

    if(WebUtils.isDebug && request.dsn === '') {
        request.dsn = 'M200000000000001'
    }
    if(WebUtils.isDebug) {
        request.dsn = request.dsn.padEnd(16, '0');
    }

    if(!request.dsn) {
        return WebUtils.done('dsn was not supplied', '400', null, event);
    }
    if(!request.firmware || !request.firmware.lastUpdate) {
        return WebUtils.done('firmware update date not supplied', '400', null, event);
    }

    const response = {} as Button2UpdateResponse;

    let identity = await v2.DeviceDal.getIdentity(request.dsn);

    if(!identity) {
        identity = {
            dsn: request.dsn,
            identity: '',
            lastUpdate: 0
        };
    }

    if(identity.identity &&
        (request.identity !== identity.identity && request.identity != 'c67fa2a3-61b4-454b-b9a5-4c5958a22db7')) {
        const error = `Could not process request for ${request.dsn} due to invalid identity ${request.identity}`;
        console.log(error);
        WebUtils.setError(new Error(error));
        return WebUtils.done('Invalid request', '400', null, event);
    }

    if(!identity.identity ||
        new Date(identity.lastUpdate).getTime() + 24 * 60 * 60 * 1000 < new Date().getTime()) {
        if(identity.lastIdentity === request.identity) {
            WebUtils.setError(new Error(`Current device has not updated its identity ${request.dsn}`));
        } else if(identity.identity) {
            identity.lastIdentity = identity.identity;
        }
        identity.identity = uuid();
        await v2.DeviceDal.putIdentity(identity);
        
        response.identity = identity.identity;
    } else if (identity.lastIdentity === request.identity) {
        response.identity = identity.identity;
    }

    console.log('Getting object head');
    const dataHead = await s3.send(new HeadObjectCommand({ 
        Bucket: process.env.firmwareBucket,
        Key: process.env.firmwareKey
    }));

    console.log('Checking object date');
    if(new Date(request.firmware.lastUpdate) < dataHead.LastModified) {
        console.log(`Last Update (${request.dsn}): ${request.firmware.lastUpdate} < ${dataHead.LastModified}`);
        console.log('Getting signed url');
        const url = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: process.env.firmwareBucket,
            Key: process.env.firmwareKey
        }), { expiresIn: 600 });

        response.url = url;
        const cert = await get(`${process.env.firmwareBucket}.s3.us-west-2.amazonaws.com`, 60, 443, 'https:', true);
        response.certificate = cert.pemEncoded + '\n-----BEGIN CERTIFICATE-----\n' + cert.issuerCertificate.raw.toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END CERTIFICATE-----\n';
    }

    WebUtils.logObjectDetails(response);
    return WebUtils.done(null, '200', response, event);
}