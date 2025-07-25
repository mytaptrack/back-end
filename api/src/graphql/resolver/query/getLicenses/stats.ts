import {
    WebUtils, LicenseDal
} from '@mytaptrack/lib';
import {
    QLLicenseStats,
} from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { Dal, MttIndexes } from '@mytaptrack/lib/dist/v2/dals/dal';

const dataDal = new Dal('data');

interface QueryParams {
    license: string;
}

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(context: MttAppSyncContext<QueryParams, any, any, {}>): Promise<QLLicenseStats> {
    throw new Error('Timestream feature is not accessible');
}
