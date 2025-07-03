const environment = process.env.STAGE ?? 'dev';
process.env.PrimaryTable = `mytaptrack-${environment}-primary`;
process.env.DataTable = `mytaptrack-${environment}-data`;
process.env.STRONGLY_CONSISTENT_READ = 'true';

import { ConfigFile } from '@mytaptrack/cdk';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});

const configFile = new ConfigFile(process.env.CONFIG_PATH ?? '../config', environment);
export const config = configFile.config;

console.log('Data Table: ', process.env.DataTable);
export const data = new Dal('data');
export const primary = new Dal('primary');

let clientId: string;
export async function getClientId() {
    if(clientId) {
        return clientId;
    }

    const result = await ssm.send(new GetParameterCommand({
        Name: `/${environment}/regional/calc/cognito/clientid`
    }));
    clientId = result.Parameter.Value;
    return clientId;
}

export function getApiKey() {
    return config.env.domain.sub.device.apikey;
}

let deviceEndpoint: string;
export async function getDeviceEndpoint() {
    if(deviceEndpoint) {
        return deviceEndpoint;
    }

    const result = await ssm.send(new GetParameterCommand({
        Name: `/${environment}/regional/calc/endpoints/device/url`
    }));
    const url = new URL(result.Parameter.Value);
    deviceEndpoint = url.hostname;
    return deviceEndpoint;
}

let apiEndpoint: string;
export async function getApiEndpoint() {
    if(apiEndpoint) {
        return apiEndpoint;
    }

    const result = await ssm.send(new GetParameterCommand({
        Name: `/${environment}/regional/calc/endpoints/api/url`
    }));
    const url = new URL(result.Parameter.Value);
    apiEndpoint = url.hostname;
    console.log("WebAPI Endpoint", apiEndpoint);
    return apiEndpoint;
}

let qlEndpoint: string;
export async function getQLEndpoint() {
    if(qlEndpoint) {
        return qlEndpoint;
    }

    const result = await ssm.send(new GetParameterCommand({
        Name: `/${environment}/regional/calc/endpoints/appsync/url`
    }));
    qlEndpoint = result.Parameter.Value;
    return qlEndpoint;
}
export const apiStage = 'prod';

export const license = process.env.License ?? '000000-000000-000000';
export const mobileAppId = '00000-00000-00000-00000';
