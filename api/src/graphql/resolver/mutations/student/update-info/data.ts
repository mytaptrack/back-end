import { WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { QLStudentUpdateInput, Student } from '@mytaptrack/types';
import { StudentOperations } from '@mytaptrack/business-logic-student';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';
import { processSchedules } from './schedules';

export interface AppSyncParams {
    student: QLStudentUpdateInput;
    copyStudentId: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<Student> {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const { student, copyStudentId } = context.arguments;
        const userId = context.identity.username;

        serviceContext.logger.info('Processing student data update', { 
            studentId: student.studentId,
            userId,
            hasScheduleCategories: !!student.scheduleCategories
        });

        // Handle schedule processing if needed (keeping original logic for now)
        let schedulePromise: Promise<void> = Promise.resolve();
        if (student.scheduleCategories) {
            schedulePromise = processSchedules(student);
        }

        // Use student business logic service to update student data
        const result = await StudentOperations.updateStudentData({
            student,
            copyStudentId,
            userContext: {
                userId,
                groups: context.identity.groups
            }
        }, serviceContext);

        // Wait for schedule processing to complete
        await schedulePromise;

        serviceContext.logger.info('Student data update completed successfully', { 
            studentId: result.studentId,
            userId
        });

        return result;

    } catch (error) {
        serviceContext.logger.error('Failed to update student data', {
            error: error.message,
            studentId: context.arguments.student?.studentId,
            userId: context.identity.username,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to update student data: ${error.message}`);
    }
}


