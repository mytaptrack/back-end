/**
 * Runs Lambda REST handlers behind Express. Everything a handler sees here is typed by
 * the same MttRestEvent contract API Gateway fills in when it runs serverless.
 */
import { Context } from 'aws-lambda';
import express from 'express';
import { MttCognitoClaims, MttRestEvent, MttRestHandler } from '@mytaptrack/lib';

export interface AdapterOptions {
  stage: string;
  claims?: MttCognitoClaims;
}

export const lambdaContext: Context = {
  functionName: 'local',
  functionVersion: '1',
  invokedFunctionArn: 'local',
  memoryLimitInMB: '1024',
  awsRequestId: 'local',
  logGroupName: 'local',
  logStreamName: 'local',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
  callbackWaitsForEmptyEventLoop: false
};

/** API Gateway's single-value maps hold strings: repeated query keys keep the last value. */
function singleValues(source: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(source).forEach(([key, value]) => {
    const last = Array.isArray(value) ? value[value.length - 1] : value;
    if (last !== undefined) {
      result[key] = String(last);
    }
  });
  return result;
}

function serializeBody(body: unknown): string | null {
  if (body === undefined || body === null) {
    return null;
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

export function toAPIGatewayEvent(req: express.Request, { stage, claims }: AdapterOptions): MttRestEvent {
  return {
    body: serializeBody(req.body),
    headers: singleValues(req.headers),
    multiValueHeaders: {},
    httpMethod: req.method,
    isBase64Encoded: false,
    path: req.path,
    pathParameters: req.params as Record<string, string>,
    queryStringParameters: singleValues(req.query),
    multiValueQueryStringParameters: {},
    stageVariables: null,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      protocol: 'HTTP/1.1',
      httpMethod: req.method,
      path: req.path,
      stage,
      requestId: Math.random().toString(36),
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now(),
      authorizer: claims ? { claims } : undefined,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: req.ip ?? '',
        user: null,
        userAgent: req.get('user-agent') ?? '',
        userArn: null
      },
      resourceId: 'local',
      resourcePath: req.path
    },
    resource: req.path
  };
}

export async function runLambda(
  handler: MttRestHandler,
  req: express.Request,
  res: express.Response,
  options: AdapterOptions
) {
  try {
    const result = await handler(toAPIGatewayEvent(req, options), lambdaContext, () => {});

    res.status(parseInt(String(result.statusCode ?? 200), 10));
    Object.entries(result.headers ?? {}).forEach(([key, value]) => {
      res.setHeader(key, String(value));
    });
    res.send(result.body);
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
}
