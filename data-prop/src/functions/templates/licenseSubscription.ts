import { WebUtils, v2 } from '@mytaptrack/lib';
import { EventBridgeEvent } from "aws-lambda";
import { isEqual } from 'lodash';

export interface StudentQueueBody {
    studentId: string;
    license: string;
};

export const handler = WebUtils.lambdaWrapper(eventHandler);

export async function eventHandler(event: EventBridgeEvent<'license', v2.MttUpdateEvent<v2.LicenseStorage>>) {
    WebUtils.logObjectDetails(event);
    const newImage = event.detail.data.new;
    const oldImage = event.detail.data.old;
    const existingImage = newImage? newImage : oldImage;

    if(newImage && oldImage && 
        isEqual(newImage.details.studentTemplates, oldImage.details.studentTemplates)) {
        console.log('No change effecting templates');
        return;
    }

    const students = await v2.StudentDal.getStudentsByLicense(existingImage.license);

    for(let i = 0; i < students.length; i += 10) {
        await v2.processStudentTemplates(students[i], existingImage.license, {
            student: newImage?.details?.studentTemplates ?? []
        });
    }
}
