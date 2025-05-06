import { WebUtils, moment } from "@mytaptrack/lib";
import { APIGatewayEvent } from "aws-lambda";

export const get = WebUtils.lambdaWrapper(handler);

export async function handler(event: APIGatewayEvent) {
    const now = moment();
    const secondsSinceEpoc = now.diff(moment('01/01/1970'), 'seconds');

    return  {
        statusCode: '200',
        body: `${secondsSinceEpoc}`
    };
}
