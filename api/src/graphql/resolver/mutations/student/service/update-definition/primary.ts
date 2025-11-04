import { WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { StudentService } from '@mytaptrack/types';
import { StudentOperations } from '@mytaptrack/business-logic-student';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

interface UpdateStudentServiceArgs {
  studentId: string;
  service: StudentService;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<UpdateStudentServiceArgs, never, never, {}>): Promise<StudentService> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const { studentId, service } = context.arguments;

        serviceContext.logger.info('Updating student service definition', { 
            studentId, 
            serviceId: service.id,
            serviceName: service.name
        });

        // Use student business logic service to update the service definition
        const result = await StudentOperations.updateStudentService(
            studentId,
            service,
            serviceContext
        );

        serviceContext.logger.info('Student service definition updated successfully', { 
            studentId, 
            serviceId: service.id
        });

        return result;

    } catch (error) {
        serviceContext.logger.error('Failed to update student service definition', {
            error: error.message,
            studentId: context.arguments.studentId,
            serviceId: context.arguments.service?.id,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to update student service definition: ${error.message}`);
    }
}
