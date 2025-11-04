import { WebUtils } from '@mytaptrack/lib';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';
import { S3 } from '@aws-sdk/client-s3';

const s3 = new S3({});

export const handler = WebUtils.lambdaWrapper(handleEvent);

export async function handleEvent(event: { key: string }) {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        serviceContext.logger.info('Processing reprocess events request', { 
            key: event.key
        });

        // Get the reprocess data from S3
        const s3Result = await s3.getObject({
            Bucket: process.env.dataBucket,
            Key: `reprocess/${event.key}`
        });

        const dataString = await s3Result.Body.transformToString();
        const input: {event: string}[] = JSON.parse(dataString);

        serviceContext.logger.debug('Retrieved S3 data', { recordCount: input.length });

        // Use the report business logic service to handle reprocessing
        await ReportOperations.reprocessEvents({
            key: event.key,
            userId: 'system', // Since this is a system-triggered reprocess
            data: input
        }, serviceContext);

        serviceContext.logger.info('Reprocess events completed successfully', { 
            key: event.key,
            recordCount: input.length
        });

    } catch (error) {
        serviceContext.logger.error('Failed to process reprocess events request', {
            error: error.message,
            key: event.key,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to process reprocess events: ${error.message}`);
    }
}