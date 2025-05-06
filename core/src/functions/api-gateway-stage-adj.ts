import { WebUtils } from "@mytaptrack/lib";
import { Context } from "aws-lambda";
import { APIGatewayClient, GetStageCommand, PatchOperation, UpdateStageCommand, UpdateStageCommandInput } from "@aws-sdk/client-api-gateway";

const apigateway = new APIGatewayClient({});

export const handler = WebUtils.lambdaWrapper(eventHandler);

async function eventHandler(event: any, context: Context) {
    console.log(event.detail.eventName);
    console.log(JSON.stringify(event));

    if(!event.detail.requestParameters) {
        return;
    }

    if(event.detail.requestParameters.stageName == process.env.removeStageName) {
        // await apigateway.deleteStage({
        //     restApiId: event.detail.requestParameters.restApiId,
        //     stageName: event.detail.requestParameters.stageName
        // }).promise();
        return;
    }

    try {
        console.log('Deleting invalid stage');
        // await apigateway.deleteStage({
        //     restApiId: event.detail.requestParameters.restApiId,
        //     stageName: process.env.removeStageName
        // }).promise();
    } catch (err) {
        console.log(`Checking error ${err.errorType} (${err.code})`);
        if(err.code != 'NotFoundException') {
            throw err;
        }
    }

    console.log('Getting stage');
    const stage = await apigateway.send(new GetStageCommand({
        restApiId: event.detail.requestParameters.restApiId,
        stageName: event.detail.requestParameters.stageName
    }));

    console.log(JSON.stringify(stage));

    const patchOperations: PatchOperation[] = [];
    if(!stage.clientCertificateId) {
        console.log('Adding certificate');
        patchOperations.push({
            op: 'replace',
            path: '/clientCertificateId',
            value: process.env.apiGatewayCert
        });
    }
    // if(!stage.cacheClusterSize) {
    //     console.log('Adding cache cluster size');
    //     patchOperations.push({
    //         op: 'replace',
    //         path: '/cacheClusterSize',
    //         value: process.env.apiGatewayCert
    //     });
    // }
    if(stage.cacheClusterEnabled) {
        console.log('Adding cacheClusterEnabled');
        patchOperations.push({
            op: 'replace',
            path: '/cacheClusterEnabled',
            value: 'false'
        });
    }
    if(stage.tracingEnabled) {
        console.log('Adding cacheClusterEnabled');
        patchOperations.push({
            op: 'replace',
            path: '/tracingEnabled',
            value: 'false'
        });
    }

    console.log('Checking methodSettings');
    const star = (stage.methodSettings || {})['*/*'] || {};
    if(!star.cacheDataEncrypted) {
        console.log('Adding dataEncrypted');
        patchOperations.push({
            op: 'replace',
            path: '/*/*/caching/dataEncrypted',
            value: 'true'
        });
    }
    if(star.cachingEnabled == undefined || star.cachingEnabled == null) {
        console.log('Adding cachingEnabled');
        patchOperations.push({
            op: 'replace',
            path: '/*/*/caching/enabled',
            value: 'false'
        });
    }
    if(star.cacheTtlInSeconds == undefined || star.cacheTtlInSeconds == null) {
        console.log('Adding ttlInSeconds');
        patchOperations.push({
            op: 'replace',
            path: '/*/*/caching/ttlInSeconds',
            value: '0'
        });
    }
    if(star.requireAuthorizationForCacheControl == undefined || star.requireAuthorizationForCacheControl == null) {
        console.log('Adding requireAuthorizationForCacheControl');
        patchOperations.push({
            op: 'replace',
            path: '/*/*/caching/requireAuthorizationForCacheControl',
            value: 'true'
        });
    }
    if(!star.loggingLevel || star.loggingLevel != 'INFO') {
        console.log('Adding loglevel');
        patchOperations.push({
            op: 'replace',
            path: '/*/*/logging/loglevel',
            value: 'INFO'
        });
    }

    if(patchOperations.length > 0) {
        console.log('Updating stage');
        const params = {
            restApiId: event.detail.requestParameters.restApiId,
            stageName: event.detail.requestParameters.stageName? event.detail.requestParameters.stageName : event.detail.requestParameters.createStageInput.stageName,
            patchOperations
        } as UpdateStageCommandInput;
        console.log(JSON.stringify(params));
        await apigateway.send(new UpdateStageCommand(params));
        console.log('Update completed');
    }
}