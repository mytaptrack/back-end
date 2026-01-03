import {
    EventDal, IoTClickType, LoggingLevel, MttEventType, MttLogger, ProcessButtonRequest, WebError, 
    WebUtils, getStudentPrimaryKey, moment, Dal, StudentConfigStorage
} from '@mytaptrack/lib';
import {
    AccessLevel,
    QLReportData, QLReportDataInput, QLReportService
} from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';

interface AppSyncParams {
  studentId: string;
  data: QLReportDataInput;
}

const logger = new MttLogger('updateData', LoggingLevel.debug);
const dataDal = new Dal('data');

export const handler = WebUtils.graphQLWrapper(handleEvent, { student: { data: AccessLevel.admin } });

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<QLReportData | QLReportService> {
    logger.log('Recovery Data', context.arguments);
    
    const data = context.arguments.data;
    const studentId = context.arguments.studentId;
    if(!data.source) {
        data.source = {
            device: 'website',
            rater: context.identity.username
        }
    }

    if (data.behavior || data.service) {
        const student = await dataDal.get<StudentConfigStorage>(getStudentPrimaryKey(studentId), 'behaviors, responses, services');

        logger.debug('student', student);
        const studentBehavior = student.behaviors?.find(x => x.id == data.behavior) ??
            student.responses?.find(x => x.id == data.behavior) ??
            student.services?.find(x => x.id == data.service);

        if(!studentBehavior) {
            throw new WebError('Could not find behavior');
        }

        let notStopped = data.duration != undefined;
        
        logger.log('Constructing message');
        const message = {
            studentId,
            behaviorId: data.behavior,
            dateEpoc: data.dateEpoc? moment(data.dateEpoc).toDate().getTime() : moment().toDate().getTime(),
            abc: data.abc,
            intensity: data.intensity,
            clickType: data.isManual? IoTClickType.manual : IoTClickType.clickCount,
            remainingLife: 1500,
            notStopped,
            duration: data.duration,
            isDuration: studentBehavior.isDuration,
            source: data.source ?? {
                device: 'website',
                rater: context.identity.username
            },
            remove: data.deleted? true : false,
            redoDurations: data.redoDurations
        } as ProcessButtonRequest;

        logger.log('sending message to event system');
        await EventDal.sendEvents('website', [{
            type: MttEventType.trackEvent,
            data: message
        }]);
    } else {
        throw new WebError('Cannot determine the type of item tracked', 400);
    }

    return context.arguments.data as any;
}
