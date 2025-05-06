import { createSignedFetcher } from 'aws-sigv4-fetch';
import { GraphQLClient } from 'graphql-request';
import fetch from 'node-fetch';

export class LambdaAppsyncQueryClient {
    private client: GraphQLClient;

    constructor(url: string) {
        this.client = new GraphQLClient(url, {
            fetch: createSignedFetcher({ service: 'appsync', region: 'us-west-2', fetch }),
        });
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
