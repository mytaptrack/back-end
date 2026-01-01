import {
    LoggingLevel,
    MttLogger,
    WebError, WebUtils, getStudentPrimaryKey, moment 
} from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';
import { StudentConfigStorage } from '@mytaptrack/lib';
import { StudentReportStorage } from '../../types/reports';

interface AppSyncParams {
  studentId: string;
  date: string;
  action: string;
}

const logger = new MttLogger('ExcludeDate', LoggingLevel.debug);
const dataDal = new Dal('data');

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<boolean> {
    const { studentId, date, action } = context.arguments;
    
    logger.debug('Excluding date from report. Student', studentId, 'date', date, 'action', action);
    const dateObj = moment(date, 'yyyy-MM-DD');
    if(!dateObj.isValid()) {
        logger.error('Invalid date provided');
        throw new WebError('Invalid date');
    }

    const weekStart = dateObj.clone().startOf('week');
    const pk = `S#${studentId}#R`;
    const sk = weekStart.clone().startOf('week').toDate().getTime() + '#D';

    logger.info('Getting report for student. pk', pk, 'sk', sk);
    const existing = await dataDal.get<StudentReportStorage>({pk, sk});
    
    if (existing) {
        logger.info('Report already exists');
        let excludeDays = existing.excludeDays ?? [];
        let includeDays = existing.includeDays ?? [];
        
        if (action === 'exclude') {
            if (!excludeDays.includes(date)) {
                logger.info('Excluding date');
                excludeDays.push(date);
            } else {
                logger.info('Date already excluded');
            }
            if(includeDays.includes(date)) {
                includeDays = includeDays.filter(d => d !== date);
            }
        } else if (action === 'include') {
            logger.info('Removing date from exclude list');
            excludeDays = excludeDays.filter(d => d !== date);

            if(includeDays.includes(date)) {
                includeDays.push(date);
            }
        } else {
            logger.error('Invalid action', action);
            throw new WebError('Invalid action. Must be "exclude" or "include"');
        }
        
        logger.info('Updating report');
        await dataDal.update({
            key: { pk, sk },
            updateExpression: 'SET excludeDays = :excludeDays, includeDays = :includeDays',
            attributeValues: {
                ':excludeDays': excludeDays,
                ':includeDays': includeDays
            }
        });
    } else {
        logger.info('No report exists');
        const includeDays = [];
        const excludeDays = [];
        if (action === 'exclude') {
            excludeDays.push(date);
        } else if (action === 'include') {
            includeDays.push(date);
        }

        const student = await dataDal.get<StudentConfigStorage>(getStudentPrimaryKey(studentId), 'license');
        const weekStartEpoc = weekStart.toDate().getTime();

        await dataDal.put<StudentReportStorage>({
            pk,
            sk,
            pksk: `${pk}#${sk}`,
            license: student.license,
            data: [],
            services: [],
            startMillis: weekStartEpoc,
            endMillis: weekStart.clone().endOf('week').toDate().getTime(),
            studentId: studentId,
            lpk: student.license,
            lsk: `${studentId}#${weekStartEpoc}`,
            tsk: `R#${weekStartEpoc}`,
            schedules: [],
            excludeDays,
            includeDays,
            excludedIntervals: [],
            version: 2
        });
    }
    
    return true;
}
