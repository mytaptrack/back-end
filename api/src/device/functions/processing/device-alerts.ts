import { EventBridgeEvent } from 'aws-lambda';
import { DeviceEventRequest } from '@mytaptrack/stack-lib';
import { IoTDeviceSubscription, IoTDeviceEventType } from '@mytaptrack/types';
import { UserDal, MailClient, WebUtils, MttEvent, MttEventType } from '@mytaptrack/lib';

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<MttEventType.trackLowPower, MttEvent<DeviceEventRequest>>) {
    const deviceEventRequest = event.detail.data;

    let textMessage = '';
    let emailTemplate = '';
    let emailMissingTextTemplate = '';
    let emailContext: any = {};

    switch(deviceEventRequest.type) {
        case IoTDeviceEventType.LowPower:
            textMessage = 
`mytaptrack reminder:
${deviceEventRequest.deviceName} (${deviceEventRequest.dsn})
Make sure to plug in the battery at the end of the day`;

            emailTemplate = 'device-low-power.html';
            emailMissingTextTemplate = 'device-low-power-no-mobile.html';
            emailContext = {
                deviceName: deviceEventRequest.deviceName,
                dsn: deviceEventRequest.dsn,
                power: Math.floor(deviceEventRequest.power),
            }
            break;
    }

    if(!textMessage) {
        console.log('No message configured');
        return;
    }

    console.log('sending messages');
    await Promise.all(deviceEventRequest.subscriptions.map(s => handleSubscriptionNotification(s, textMessage, emailTemplate, emailMissingTextTemplate, emailContext)));
    console.log('all messages sent');
}

async function handleSubscriptionNotification(subscription: IoTDeviceSubscription, textMessage: string, emailTemplate: string, emailMissingTextTemplate: string, emailContext: any) {
    if(!subscription.userId) {
        console.log('UserId is not found in subscription');
        return;
    }

    console.log('getting user');
    const user = await UserDal.getUser(subscription.userId, '');
    let warnMobileNumberMissing = false;

    if(subscription.email) {
        console.log('sending email');
        await MailClient.sendTemplateEmailAdv(warnMobileNumberMissing? emailMissingTextTemplate : emailTemplate, 'mytaptrack reminder: Have you charged your mytaptrack clicker today?',  emailContext, [user.details.email]);
        console.log('email sent');
    }
}
