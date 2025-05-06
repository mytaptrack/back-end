import * as https from 'https';
import { wait } from '.';

export async function rawHttpRequest(method: string, url: string, body: string, encoding: string = 'text/plain') {
    const headers = {
        'Content-Type': encoding,
        'Content-Length': body.length
    };
    console.debug(`${method} https://${url}`);
    const result = await new Promise<string>((resolve, reject) => {
        const requestParams: https.RequestOptions = {
            method,
            port: 443,
            headers
        };
        console.debug('Request Params', requestParams);
        console.debug('Body', body);
        const request = https.request(url, requestParams, (res) => {
            let content = '';
            res.on('error', (err) => {
                console.error(err);
                reject(err);
            });
            res.on('data', (raw) => {
                content += raw.toString();
            });
            res.on('end', (val) => {
                if(res.statusCode != 200) {
                    reject(`Http call failed with ${res.statusCode}`);
                    console.error("http error ", res.statusCode, " ", content);
                    return;
                }
                resolve(content);
            });
        });
        request.on('error', (err) => {
            console.error(err);
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
    console.debug(`${method} https://${endpoint}${path}`);
    const result = await new Promise<string>((resolve, reject) => {
        const requestParams: https.RequestOptions = {
            host: endpoint,
            path,
            method,
            port: 443,
            headers
        };
        console.debug('Request Params', requestParams);
        console.debug('Body', body);
        const request = https.request(requestParams, (res) => {
            let content = '';
            res.on('error', (err) => {
                console.error(err);
                reject(err);
            });
            res.on('data', (raw) => {
                content += raw.toString();
            });
            res.on('end', (val) => {
                if(res.statusCode != 200) {
                    reject(`Http call failed with ${res.statusCode}`);
                    console.error("http error ", res.statusCode, " ", content);
                    return;
                }
                resolve(content);
            });
        });
        request.on('error', (err) => {
            console.error(err);
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
