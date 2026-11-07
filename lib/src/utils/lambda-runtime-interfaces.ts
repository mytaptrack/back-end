import { APIGatewayProxyEventBase, Context } from 'aws-lambda';

/** Cognito claims as the REST handlers read them: groups are comma-separated. */
export interface MttCognitoClaims {
    sub: string;
    'cognito:username': string;
    email?: string;
    name?: string;
    'cognito:groups'?: string;
}

/**
 * The REST event handlers receive. API Gateway builds it in serverless and the Express
 * adapter builds it in containers. Device routes have no authorizer in either mode.
 */
export type MttRestEvent = APIGatewayProxyEventBase<{ claims: MttCognitoClaims } | undefined>;

/** WebUtils.done returns statusCode as a string, and raw handlers return a number. */
export interface MttRestResponse {
    statusCode?: number | string;
    headers?: { [header: string]: string | number | boolean };
    body?: string;
}

export type MttRestHandler = (
    event: MttRestEvent,
    context: Context,
    callback: () => void
) => Promise<MttRestResponse>;
