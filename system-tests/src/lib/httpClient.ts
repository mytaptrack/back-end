import * as https from 'https';
import { Logger, LoggingLevel } from './logging';

const logger = new Logger(LoggingLevel.WARN);

export async function rawHttpRequest(method: string, url: string, body: string, encoding: string = 'text/plain') {
    const headers = {
        'Content-Type': encoding,
        'Content-Length': body.length
    };
    logger.debug(`${method} https://${url}`);
    const result = await new Promise<string>((resolve, reject) => {
        const requestParams: https.RequestOptions = {
            method,
            port: 443,
            headers
        };
        logger.debug('Request Params', requestParams);
        logger.debug('Body', body);
        const request = https.request(url, requestParams, (res) => {
            let content = '';
            res.on('error', (err) => {
                logger.error(err);
                reject(err);
            });
            res.on('data', (raw) => {
                content += raw.toString();
            });
            res.on('end', (val) => {
                if(res.statusCode != 200) {
                    reject(`Http call failed with ${res.statusCode}`);
                    logger.error("http error ", res.statusCode, " ", content);
                    return;
                }
                resolve(content);
            });
        });
        request.on('error', (err) => {
            logger.error(err);
            reject(err);
        });

        request.write(body);
        request.end();
    });
}

export async function httpRequest(endpoint: string, auth: { apiKey?: string, cognito?: string }, method: string, path: string, body: any) {
    const bodyStr = body? JSON.stringify(body) : undefined;
    const headers = {
        'Content-Type': 'application/json',
    };
    if(bodyStr) {
        headers['Content-Length'] = bodyStr?.length;
    }
    if(auth?.apiKey) {
        headers['x-api-key'] = auth.apiKey;
    }
    if(auth?.cognito) {
        headers['Authorization'] = auth.cognito;
    }
    logger.debug(`${method} https://${endpoint}${path}`);
    const result = await new Promise<string>((resolve, reject) => {
        const requestParams: https.RequestOptions = {
            host: endpoint,
            path,
            method,
            port: 443,
            headers
        };
        logger.debug('Request Params', requestParams);
        logger.debug('Body', body);
        const request = https.request(requestParams, (res) => {
            let content = '';
            res.on('error', (err) => {
                logger.error(err);
                reject(err);
            });
            res.on('data', (raw) => {
                content += raw.toString();
            });
            res.on('end', (val) => {
                if(res.statusCode != 200) {
                    reject(`Http call failed with ${res.statusCode}`);
                    logger.error("http error ", res.statusCode, " ", content);

                    // Print callstack
                    const stack = new Error().stack;
                    logger.error(stack);

                    return;
                }
                resolve(content);
            });
        });
        request.on('error', (err) => {
            logger.error(err);
            reject(err);
        });

        request.setHeader('Content-Type', 'application/json');
        if(bodyStr) {
            request.write(bodyStr);
        }
        request.end();
    });

    return result;
}
