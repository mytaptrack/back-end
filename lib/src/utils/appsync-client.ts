import { createSignedFetcher } from 'aws-sigv4-fetch';
import { GraphQLClient } from 'graphql-request';
import fetch from 'node-fetch';

export class LambdaAppsyncQueryClient {
    private client: GraphQLClient;

    constructor(url: string) {
        // In local mode, use regular HTTP requests instead of signed requests
        if (process.env.USE_LOCAL === 'true' || process.env.NODE_ENV === 'development') {
            this.client = new GraphQLClient(url, {
                fetch: fetch as any,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            this.client = new GraphQLClient(url, {
                // aws-sigv4-fetch v5 hands fetch a Request object, which node-fetch 2 rejects
                // ("Only absolute URLs are supported"), so sign onto the runtime's global fetch.
                fetch: createSignedFetcher({
                    service: 'appsync',
                    region: process.env.AWS_REGION || 'us-west-2'
                }),
            });
        }
    }

    async query<T>(query: string, variables: any, resultProp: string): Promise<T> {
        const response = await this.client.request({
            document: query, 
            variables
        });
        
        const result = await response;
        return result? result[resultProp] as T : undefined;
    }
}
