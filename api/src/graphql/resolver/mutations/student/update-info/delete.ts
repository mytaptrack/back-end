import { WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { StudentOperations } from '@mytaptrack/business-logic-student';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError, AccessDeniedError } from '@mytaptrack/business-logic-core';

interface DeleteStudentsArgs {
    studentIds: string[];
    license: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<DeleteStudentsArgs, never, never, {}>): Promise<boolean> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const { studentIds, license } = context.arguments;

        serviceContext.logger.info('Starting student deletion process', { 
            studentIds, 
            license,
            count: studentIds.length
        });

        // Use student business logic service to delete students
        const result = await StudentOperations.deleteStudents(
            studentIds,
            license,
            serviceContext
        );

        serviceContext.logger.info('Student deletion completed successfully', { 
            studentIds, 
            license,
            count: studentIds.length
        });

        return result;

    } catch (error) {
        serviceContext.logger.error('Failed to delete students', {
            error: error.message,
            studentIds: context.arguments.studentIds,
            license: context.arguments.license,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof BusinessLogicError || error instanceof AccessDeniedError) {
            throw error;
        }
        
        throw new Error(`Failed to delete students: ${error.message}`);
    }
}
