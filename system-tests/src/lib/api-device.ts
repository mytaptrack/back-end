import { AppRetrieveDataPostRequest, AppRetrieveDataPostResponse, AppTrackRequest } from "@mytaptrack/types";
import { httpRequest } from "./httpClient";
import { moment } from '@mytaptrack/lib';
import { readFileSync } from "fs";
import * as https from 'https';
import * as config from '../config';

const identity = "066c859c-9716-407e-8ce3-b72a92d51a98";
const prefix = config.config.env.domain.sub.device.path ?? '';

export async function clickButton(clickCount: number, serialNumbers: string) {
    let now = moment();
    now = now.tz('America/Los_Angeles')

    return await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'PUT', `${prefix}/data`, {
        dsn: serialNumbers,
        identity,
        pressType: "click",
        clickCount,
        remainingLife: 177,
        eventDate: moment().toISOString(),
        segment:0,
        complete: true
    });
}

//
// App apis
//
export async function getAppDefinitions(deviceId: string, tokens: string[]) {  
    
    const cleanTokens = tokens.map(x => x.replace(`${config.config.env.domain.sub.device.appid ?? 'mytaptrack'}://student?token=`, ''))

    console.info("Constructing message")
    let jsonBodyDict = {
        device: {
            id: deviceId, 
            name: 'System Test IPhone'
        }, 
        tokens: cleanTokens,
        notifications: {
            token: '', 
            os: "ios"
        }
    } as AppRetrieveDataPostRequest;

    console.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'POST', `${prefix}/app`, jsonBodyDict);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}
export async function getAppDefinitionsV3(deviceId: string, tokens: string[]) {  
    const cleanTokens = tokens.map(x => x.replace(`${config.config.env.domain.sub.device.appid ?? 'mytaptrack'}://student?token=`, ''))

    console.info("Constructing message")
    let jsonBodyDict = {
        device: {
            id: deviceId, 
            name: 'System Test IPhone'
        }, 
        tokens: cleanTokens,
        notifications: {
            token: '', 
            os: "ios"
        }
    } as AppRetrieveDataPostRequest;

    console.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'POST', `${prefix}/v3/app`, jsonBodyDict);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}
export async function deleteAppDefinitions(deviceId: string, tokens: string[]) {  
    console.info("Constructing message")
    let jsonBodyDict = {
        device: {
            id: deviceId, 
            name: 'System Test IPhone'
        }, 
        tokens: tokens,
        notifications: {
            token: '', 
            os: "ios"
        }
    } as AppRetrieveDataPostRequest;

    console.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'DELETE', `${prefix}/app`, jsonBodyDict);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}

export async function appTokenTrack(request: AppTrackRequest) {
    await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'PUT', `${prefix}/app`, request);
}

export async function sendAudio(dsn: string) {
    console.log('Reading audio data');
    const buffer = Buffer.from(readFileSync('./src/tests/devices/M21343B210000010').toString('utf-8'), 'base64');
    console.log('Content read', buffer.length);

    console.log('Converting DSNs to array', dsn);
    const dsns = [dsn];
    const endpoint = await config.getDeviceEndpoint();

    await Promise.all(dsns.map(async dsn => {
        await new Promise<void>((resolve, reject) => {
            console.log('Starting request');
            const request = https.request({
                host: endpoint,
                path: `/audio`,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet',
                    'dsn': dsn,
                    'x-api-key': config.getApiKey(),
                    'Content-Length': 352004
                }
            }, (res) => {
                console.log('Received response');
                res.on('error', (err) => {
                    console.log(err);
                    reject(err);
                });
                res.on('data', (data) => {
                    console.log('Data call');
                });
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
    }));
}

export async function getDeviceTime() {
    console.info("Constructing message")
    
    console.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'GET', `${prefix}/time`, {});
    console.log('GetTime response', response);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}

export async function getDevicePing() {
    console.info("Constructing message")
    
    console.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'GET', `${prefix}/ping`, {});

    return response;
}

export interface Button2UpdateRequest {
    dsn: string;
    identity: string;
    firmware: {
        lastUpdate: string;
    };
}

export async function getFirmware(dsn: string, time: string) {
    console.info("Constructing message")
    let jsonBodyDict = {
        dsn: dsn,
        identity,
        firmware: {
            lastUpdate: time
        }
    } as Button2UpdateRequest;

    console.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'POST', `${prefix}/firmware`, jsonBodyDict);

    return JSON.parse(response) as { identity: string, url: string };
}