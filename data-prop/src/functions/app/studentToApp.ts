import { v2, WebUtils } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';

export async function handleEvent(event: EventBridgeEvent<'student-config', v2.MttUpdateEvent<v2.StudentConfig>>) {
    WebUtils.logObjectDetails(event);
    const oldImage = event.detail.data.old;
    const newImage = event.detail.data.new;

    if(!newImage) {
        // Student deleted
        return;
    } else if (!oldImage) {
        // New student created, no apps yet
        return;
    } else {
        console.log('Getting apps and student');
        const [apps, studentPii] = await Promise.all([
            v2.AppDal.getAppsForStudent(newImage.studentId),
            v2.StudentDal.getStudent(newImage.studentId)
        ]);

        if (newImage.license != oldImage.license) {
            console.log('Updating licenses');
            await Promise.all(apps.map(x => v2.AppDal.updateLicense(newImage.studentId, x.id, newImage.license)));
        }
        await Promise.all(apps.map(async app => {
            console.log('Getting app details');
            const [config, pii] = await Promise.all([
                v2.AppDal.getAppConfig(app.studentId, app.id),
                v2.AppDal.getAppPii(app.studentId, app.id)
            ]);

            await Promise.all([
                v2.AppDal.updateAppConfig({
                    ...config,
                    deviceId: config.deviceId ?? '',
                    appConfig: config.config
                }),
                v2.AppDal.updateAppPii(newImage.studentId, config.appId, config.license, config.deviceId, {
                    ...pii,
                    abc: studentPii.abc,
                    deviceId: pii.deviceId? pii.deviceId : undefined,
                    behaviorNames: [
                        ...studentPii.behaviors.map(y => ({ id: y.id!, title: y.name})),
                        ...studentPii.responses.map(y => ({ id: y.id!, title: y.name})),
                    ].filter(x => config.config.behaviors.find(y => y.id == x.id))
                })
            ]);
        }));
    }
}

export const handler = WebUtils.lambdaWrapper(handleEvent);