import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { 
    WebUtils, IoTClickType, moment, ProcessButtonRequestExtended, DataDal, 
    DeviceDal, EventDal, IoTDeviceExtended, MttEventType, StudentDal 
} from '@mytaptrack/lib';
import { DeviceReports } from '@mytaptrack/types';
import { SendNotificationRequest } from '@mytaptrack/stack-lib';
import { EventBridgeEvent } from 'aws-lambda';

const s3 = new S3Client({});

export const processRequest = WebUtils.lambdaWrapper(handler);

interface ExtendedDeviceReports extends DeviceReports {
    studentBehavior: string;
    sunday: moment.Moment;
    behavior: string;
}

export async function handler(event: EventBridgeEvent<'track-event', ProcessButtonRequestExtended>) {
    WebUtils.logObjectDetails(event);

    try {
        console.log('Processing messages');
        await processMessage(event.detail);
    } catch(err) {
        console.log('Error processing queue', err);
        throw err;
    }
}

async function processMessage(request: ProcessButtonRequestExtended) {
    if(!(request.studentId && request.behaviorId) && (!request.serialNumber || !request.clickType)) {
        console.log('Required data missing', request);
        WebUtils.setError(new Error('Required data missing'));
        return;
    }
    
    let device = null;
    if(request.serialNumber && request.serialNumber.startsWith('M')) {
        console.log('Getting device: ' + request.serialNumber);
        device = await DeviceDal.get(request.serialNumber);
        if(!device) {
            console.warn(`The device ${request.serialNumber} has not been registered`);
            device = {
                dsn: request.serialNumber,
                validated: false
            };
        }
        if(WebUtils.isDebug) {
            console.log('Device:');
            console.log(JSON.stringify(device));
        }
    }

    var dsn: string = device?.dsn;
    if(dsn && dsn.startsWith('M') && !device.validated) {
        console.log('Validating click type')
        WebUtils.logObjectDetails(device);

        await DeviceDal.setValidated(request.serialNumber);
    } else {
        console.log('Processing Device');
        await processDevice(request, device);
    }
}

async function processDevice(request: ProcessButtonRequestExtended, device: IoTDeviceExtended) {
    let behavior = request.behaviorId;
    let studentId = request.studentId;
    let license: string;

    if(device && device.license) {
        license = device.license;
    } else {
        const student = await StudentDal.getStudentConfig(studentId);
        license = student.license;
    }

    console.log('Getting reports');
    
    const eventTime = moment(request.dateEpoc);
    console.debug('notStopped', request.notStopped);

    console.log('Updating subscribers');
    if(request.clickType != IoTClickType.manual) {
        await updateEventSubscriptions({
            studentId,
            behaviorId: behavior,
            eventTime: eventTime.toISOString(),
            source: request.source,
            weekMod2: request.notStopped? 1 : 0,
            dayMod2: request.notStopped? 1 : 0
        });
    }

    console.log('Message enqueued successfully');

    // await checkPattern(request, license);
}

async function checkPattern(request: ProcessButtonRequestExtended, license: string) {
    const date = moment(request.dateEpoc);
    
    try {
        const s3Response = await s3.send(new GetObjectCommand({
            Bucket: process.env.aiBucket,
            Key: `student/${request.studentId}/projection/${request.behaviorId}.csv`
        }));

        const body = (await s3Response.Body.transformToString('utf-8')).split('\n').map(x => x.split(','));
        body.splice(0, 1);
        const rowIndex = body.findIndex(x => moment(x[1]).diff(date, 'hours') === 0);
        const row = body[rowIndex];
        if(!row) {
            return;
        }

        const reportResult = await getReports(request, request.behaviorId, request.studentId, license);
        console.debug('reportResult', reportResult);
        const report = reportResult.studentReport;

        const events = report.data.filter(x => {
            if(x.behavior != request.behaviorId) {
                return false;
            }
            const diff = date.diff(moment(x.dateEpoc), 'hours');
            return diff >= 0 && diff <= 1;
        });
        
        const p9 = Number.parseFloat(row[3]);
        if(events.length > p9) {
            await EventDal.sendEvents<ProcessButtonRequestExtended>('processing', [{
                type: MttEventType.behaviorChange,
                data: request
            }]);
        }
    } catch (err) {
        if(err.Code !== 'AccessDenied') {
            throw err;
        }
    }
}

export async function getReports(request: ProcessButtonRequestExtended, behavior: string, studentId: string, license?: string): Promise<ExtendedDeviceReports> {
    console.log('Creating estimate for sunday');
    let sundayDate = moment(request.dateEpoc).startOf('day');
    if(request.timezone) {
        sundayDate = moment(sundayDate.tz(request.timezone).format('MM/DD/yyyy'));
        console.log('Timezone Calc', sundayDate.format('yyyy/M/D'));
    }
    sundayDate = sundayDate.add(sundayDate.toDate().getDay() * -1, 'days');
    console.log('Constructing student behavior', sundayDate.format('yyyy/MM/DD'));

    const studentReport = await DataDal.getData(studentId, sundayDate, sundayDate.clone().add(6, 'days').startOf('day'));

    console.log('Resolving promise');
    let retval = {
        studentBehavior: studentId,
        sunday: sundayDate,
        behavior: behavior,
        behaviorReport: studentReport
    } as ExtendedDeviceReports;
    WebUtils.logObjectDetails(retval);
    
    return retval;
}

async function updateEventSubscriptions(report: SendNotificationRequest) {
    console.log('Sending event to process subscribers', report.dayMod2);
    try {
        await EventDal.sendEvents<SendNotificationRequest>('processing', [{
            type: MttEventType.requestNotify,
            data: report
        }]);
    } catch (err) {
        console.log('Could not start notification processing: ' + err);
    }
}
