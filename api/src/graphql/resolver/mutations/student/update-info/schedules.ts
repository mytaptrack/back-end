import { QLStudentUpdateInput } from "@mytaptrack/types";
import { StudentOperations } from '@mytaptrack/business-logic-student';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

export async function processSchedules(student: QLStudentUpdateInput) {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        if (!student.studentId || !student.license || !student.scheduleCategories) {
            throw new ValidationError('Missing required fields for schedule processing', serviceContext.config.correlationId, {
                hasStudentId: !!student.studentId,
                hasLicense: !!student.license,
                hasScheduleCategories: !!student.scheduleCategories
            });
        }

        serviceContext.logger.info('Processing student schedules', { 
            studentId: student.studentId,
            scheduleCount: student.scheduleCategories.length
        });

        // Use student business logic service to process schedules
        await StudentOperations.processSchedules(
            student.studentId,
            student.license,
            student.scheduleCategories,
            serviceContext
        );

        serviceContext.logger.info('Student schedules processed successfully', { 
            studentId: student.studentId,
            scheduleCount: student.scheduleCategories.length
        });

    } catch (error) {
        serviceContext.logger.error('Failed to process student schedules', {
            error: error.message,
            studentId: student.studentId,
            stack: error.stack
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error(`Failed to process student schedules: ${error.message}`);
    }
}
