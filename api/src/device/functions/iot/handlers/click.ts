import { WebUtils } from "@mytaptrack/lib";
import { Context, IoTEvent } from "aws-lambda";

export const eventHandler = WebUtils.lambdaWrapper(handler);

async function handler(event: { message: { dsn: string, clickCount: number }, full_topic_name: string }, context: Context) {
    console.debug("Received event: ", event);
}