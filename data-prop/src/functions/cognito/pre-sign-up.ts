import { v2, WebUtils } from '@mytaptrack/lib';

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: any) {
    console.log(event);
    const email = event.request.userAttributes.email;
    const user = await v2.UserDal.getUserByEmail(email);
    if(user) {
        throw new Error("Email address has already been used");
    }
    
    return event;
}
