import { AccessLevel, QLReportData, QLReportDataSource, QLReportDetails, QLReportService } from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { StudentReportStorage } from '../../types/reports';
import { WebUtils, moment } from '@mytaptrack/lib';
import { ReportOperations } from '@mytaptrack/business-logic-report';
import { createLambdaServiceContext, BusinessLogicError, ValidationError, NotFoundError } from '@mytaptrack/business-logic-core';

interface Params {
    studentId: string;
    startDate: string;
    endDate: string;
    scope: {
        behavior: boolean;
        service: boolean;
    }
}

interface StashData {
    start: number;
    end: number;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

async function handleEvent(context: MttAppSyncContext<Params, never, never, StashData>) {
    const serviceContext = await createLambdaServiceContext();
    
    try {
        const startDate = moment(context.arguments.startDate);
        const endDate = moment(context.arguments.endDate);
        const scope = context.arguments.scope;
        const restrictions = context.stash.permissions.student;
        const license = context.stash.permissions.license;
        
        serviceContext.logger.info('Getting student report data', {
            studentId: context.arguments.studentId,
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            scope
        });

        // Use the report business logic service to get report data
        const reportData = await ReportOperations.getStudentReportData({
            studentId: context.arguments.studentId,
            startDate: context.arguments.startDate,
            endDate: context.arguments.endDate,
            scope: scope,
            permissions: {
                serviceData: restrictions.serviceData,
                behaviors: restrictions.behaviors,
                services: restrictions.services,
                license: license
            },
            includeRaterNames: context.info.selectionSetList.find(x => x === 'raters') ? true : false
        }, serviceContext);

        const result = {
            data: reportData.data,
            services: reportData.services,
            raters: reportData.raters,
            startMillis: reportData.startMillis,
            endMillis: reportData.endMillis,
            schedules: reportData.schedules,
            excludeDays: reportData.excludeDays,
            includeDays: reportData.includeDays,
            excludedIntervals: reportData.excludedIntervals,
            lastUpdateDate: reportData.lastUpdateDate,
            version: reportData.version
        } as QLReportDetails;

        serviceContext.logger.info('Student report data retrieved successfully', {
            studentId: context.arguments.studentId,
            dataCount: result.data.length,
            serviceCount: result.services.length
        });

        return result;
    } catch (error) {
        serviceContext.logger.error('Failed to get student report data', {
            error: error.message,
            studentId: context.arguments.studentId,
            startDate: context.arguments.startDate,
            endDate: context.arguments.endDate
        });

        if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new BusinessLogicError('Failed to retrieve report data', serviceContext.config.correlationId);
    }
}
