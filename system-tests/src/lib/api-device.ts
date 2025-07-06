import { AppRetrieveDataPostRequest, AppRetrieveDataPostResponse, AppTrackRequest } from "@mytaptrack/types";
import { httpRequest } from "./httpClient";
import { moment } from '@mytaptrack/lib';
import { readFileSync } from "fs";
import * as https from 'https';
import * as config from '../config';
import { Logger, LoggingLevel } from "./logging";

const logger = new Logger(LoggingLevel.WARN);
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
    
    const cleanTokens = tokens.map(x => {
        // Get token query parameter from url provided
        const url = new URL(x);
        const token = url.searchParams.get('token');
        return token ?? x;
    })

    logger.info("Constructing message")
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

    logger.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'POST', `${prefix}/app`, jsonBodyDict);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}
export async function getAppDefinitionsV3(deviceId: string, tokens: string[]) {  
    const cleanTokens = tokens.map(x => {
        // Pull out the query parameter token from the url
        const url = new URL(x);
        const token = url.searchParams.get('token');
        return token ?? x;
    });

    logger.info("Constructing message")
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

    logger.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'POST', `${prefix}/v3/app`, jsonBodyDict);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}
export async function deleteAppDefinitions(deviceId: string, tokens: string[]) {  
    logger.info("Constructing message")
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

    logger.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'DELETE', `${prefix}/app`, jsonBodyDict);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}

export async function appTokenTrack(request: AppTrackRequest) {
    await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'PUT', `${prefix}/app`, request);
}

export async function sendAudio(dsn: string) {
    logger.debug('Reading audio data');
    const buffer = Buffer.from(readFileSync('./src/tests/devices/M21343B210000010').toString('utf-8'), 'base64');
    logger.debug('Content read', buffer.length);

    logger.debug('Converting DSNs to array', dsn);
    const dsns = [dsn];
    const endpoint = await config.getDeviceEndpoint();

    await Promise.all(dsns.map(async dsn => {
        await new Promise<void>((resolve, reject) => {
            logger.debug('Starting request');
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
                logger.debug('Received response');
                res.on('error', (err) => {
                    logger.debug(err);
                    reject(err);
                });
                res.on('data', (data) => {
                    logger.debug('Data call');
                });
                res.on('end', () => {
                    logger.debug('Completed call');
                    resolve();
                });
            });
            request.on('error', (err) => {
                logger.debug(err);
                reject(err);
            });
    
            logger.debug('Writing data');
            request.write(buffer);
            request.end();
        });
    }));
}

export async function getDeviceTime() {
    logger.info("Constructing message")
    
    logger.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'GET', `${prefix}/time`, {});
    logger.info('GetTime response', response);

    return JSON.parse(response) as AppRetrieveDataPostResponse;
}

export async function getDevicePing() {
    logger.info("Constructing message")
    
    logger.info("Executing request")
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
    logger.info("Constructing message")
    let jsonBodyDict = {
        dsn: dsn,
        identity,
        firmware: {
            lastUpdate: time
        }
    } as Button2UpdateRequest;

    logger.info("Executing request")
    const response = await httpRequest(await config.getDeviceEndpoint(), { apiKey: config.getApiKey() }, 'POST', `${prefix}/firmware`, jsonBodyDict);

    return JSON.parse(response) as { identity: string, url: string };
}