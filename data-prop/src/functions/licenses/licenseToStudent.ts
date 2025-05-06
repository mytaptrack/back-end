import { v2, WebUtils } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<'license', v2.MttUpdateEvent<v2.LicenseStorage>>) {
    WebUtils.logObjectDetails(event);
    const oldLicense = event.detail.data.old;
    const newLicense = event.detail.data.new;

    console.log('Checking if license will effect students');
    if(newLicense && 
        (   
            newLicense.details.expiration != oldLicense?.details.expiration ||
            JSON.stringify(newLicense.details.features) != JSON.stringify(oldLicense?.details.features)
        )) {
        console.log('Getting students for license');
        const students = await v2.StudentDal.getStudentsByLicense(newLicense.license);
        if(students) {
            console.log('Updating students');
            for(let student of students) {
                WebUtils.logObjectDetails(student);
                student.licenseDetails!.expiration = newLicense.details.expiration;
                student.licenseDetails!.features = newLicense.details.features!;
                console.log('Updating student', student.studentId);
                WebUtils.logObjectDetails(student);
                await v2.StudentDal.updateLicense(student.studentId, newLicense.license, {
                    features: newLicense.details.features!,
                    fullYear: student.licenseDetails!.fullYear,
                    flexible: student.licenseDetails!.flexible,
                    transferable: student.licenseDetails!.transferable,
                    expiration: newLicense.details.expiration,
                }, student.archived? true : false, student.tags);
            }
        }
    }
    console.log('Processing complete');
}
