import { MttAppSyncContext } from '@mytaptrack/cdk';
import { processData } from '../report/process';
import { QLReportDataInput, QLReportData } from '@mytaptrack/types';
import { WebUtils, MttLogger, LoggingLevel, ProcessButtonRequest } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { IoTClickType } from '@mytaptrack/lib/dist/v2/types/iotEvents';

const logger = new MttLogger('updateDataInReport', LoggingLevel.warn);

interface UpdateDataArgs {
    studentId: string;
    data: QLReportDataInput;
}

export const handler = WebUtils.graphQLWrapper(eventHandler, { student: { data: AccessLevel.admin } });

export async function eventHandler(context: MttAppSyncContext<UpdateDataArgs, any, any, any>): Promise<QLReportData> {
    const { studentId, data } = context.arguments;

    logger.info('Processing updateDataInReport for student', studentId);

    const buttonRequest: ProcessButtonRequest = {
        studentId,
        behaviorId: data.behavior,
        dateEpoc: data.dateEpoc,
        duration: data.duration,
        isManual: data.isManual ?? false,
        notStopped: data.notStopped,
        source: data.source as any,
        abc: data.abc as any,
        intensity: data.intensity,
        redoDurations: data.redoDurations,
        remove: false,
        // Required fields with defaults for website submissions
        remainingLife: 0,
        serialNumber: '',
        clickType: IoTClickType.SINGLE,
    };

    await processData(buttonRequest, studentId);

    return {
        dateEpoc: data.dateEpoc,
        behavior: data.behavior,
        duration: data.duration,
        isManual: data.isManual,
        source: data.source as any,
        abc: data.abc as any,
        intensity: data.intensity,
    } as QLReportData;
}
