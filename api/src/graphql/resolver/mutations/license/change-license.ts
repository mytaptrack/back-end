import {
    WebUtils, WebError, LicenseDal, getLicenseKey
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { LicenseDetails, QLLicenseUpdate } from '@mytaptrack/types';
import { Stripe } from 'stripe';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Dal, DalKey, MttIndexes } from '@mytaptrack/lib/dist/v2/dals/dal';
import { TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';

let stripe: Stripe;
let endpointSecret: string;
const secretsManager = new SecretsManagerClient({});

const data = new Dal('data');
const primary = new Dal('primary');

export interface AppSyncParams {
    input: QLLicenseUpdate;
}

export interface LicenseDetailsEx extends LicenseDetails {
    userId: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<LicenseDetailsEx> {
    console.debug('Event', context);
    const params = context.arguments.input;
    const license = await LicenseDal.get(params.license);

    // Handle license property updates
    let hasUpdates = false;
    const updates: any = {};
    const updateExpressions: string[] = [];
    const attributeNames: any = {};
    const attributeValues: any = {};

    if (params.abcCollections !== undefined) {
        updateExpressions.push('#details.#abcCollections = :abcCollections');
        attributeNames['#details'] = 'details';
        attributeNames['#abcCollections'] = 'abcCollections';
        attributeValues[':abcCollections'] = params.abcCollections;
        hasUpdates = true;
    }

    if (params.features !== undefined) {
        updateExpressions.push('#details.#features = :features');
        attributeNames['#details'] = 'details';
        attributeNames['#features'] = 'features';
        attributeValues[':features'] = params.features;
        hasUpdates = true;
    }

    if (params.tags !== undefined) {
        updateExpressions.push('#details.#tags = :tags');
        attributeNames['#details'] = 'details';
        attributeNames['#tags'] = 'tags';
        attributeValues[':tags'] = params.tags;
        hasUpdates = true;
    }

    if (hasUpdates) {
        await data.update({
            key: getLicenseKey(params.license),
            updateExpression: `SET ${updateExpressions.join(', ')}`,
            attributeNames,
            attributeValues
        });
        
        // Update local license object for return
        if (params.abcCollections !== undefined) license.abcCollections = params.abcCollections;
        if (params.features !== undefined) Object.assign(license.features, params.features);
        if (params.tags !== undefined) license.tags = params.tags;
    }

    return {
        userId: context.identity.username,
        ...license
    };
}

async function cancelStripe(license: LicenseDetails) {
    let stripeId = license.stripe?.id;
    if(!stripe) {
        const secretResult = await secretsManager.send(new GetSecretValueCommand({
            SecretId: process.env.stripeSecret
        }));

        const secret = JSON.parse(secretResult.SecretString!);
        endpointSecret = secret.signing

        stripe = new Stripe(secret.secret);
    }
    if(license.stripe) {
        try {
            console.log('Cancelling stripe subscription')
            await stripe.subscriptions.cancel(stripeId);
            console.log('Stripe cancel succeeded');
        } catch (err) {
            console.error('An error occured', err);
            console.error('params', license);
            WebUtils.setError(err);
        }
    }
}
