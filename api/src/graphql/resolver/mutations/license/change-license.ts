import {
    WebUtils, LicenseDal, getLicenseKey, Dal
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { LicenseDetails, QLLicenseUpdate } from '@mytaptrack/types';

const data = new Dal('data');

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
    }

    return {
        userId: context.identity.username,
        ...license
    };
}
