import { v2, WebUtils } from '@mytaptrack/lib';

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: any) {
    console.log(event);
    const userId = event.userName;
    const user = await v2.UserDal.getUserConfig(userId);
    if(!user) {
        const email = event.request.userAttributes['cognito:email_alias'] ?? event.request.userAttributes.email;
        console.log('Finding license by email', email);

        const licenseDetails = await v2.LicenseDal.findByEmail(email);
        const license = licenseDetails?.license ?? '';
        if(license) {
            console.log('Adding license to user');
            await v2.UserDal.addUserToLicense(userId, license);
        } else {
            console.log('No license found');
        }
    }
    return event;
}
