import { DalBaseClass } from "./dal";
import { StoredSubscriptionConfig, StoredSubscriptionPii } from '..';
import { getStudentSubscriptionKey, moment } from '../..';
import { typesV2 } from '@mytaptrack/types';

class NotificationDalClass extends DalBaseClass { 
    async get(studentId: string): Promise<typesV2.StudentSubscriptions> {
        const key = getStudentSubscriptionKey(studentId);
        const [ config, pii ] = await Promise.all([
            this.data.get<StoredSubscriptionConfig>(key),
            this.primary.get<StoredSubscriptionPii>(key)
        ]);

        return {
            studentId,
            license: config?.license || pii?.license,
            notifications: pii?.notifications.map(bpi => {
                const conf = config.notifications.find(x => x.name == bpi.name);
                return {
                    name: conf.name,
                    behaviorIds: conf.behaviorIds,
                    responseIds: conf.responseIds,
                    notifyUntilResponse: conf.notifyUntilResponse,
                    emails: bpi.emails,
                    mobiles: bpi.mobiles,
                    deviceIds: conf.deviceIds,
                    userIds: conf.userIds,
                    messages: bpi.messages
                } as typesV2.StudentSubscriptionsGroup;
            }) || [],
            updateEpoc: pii?.updateEpoc || config?.updateEpoc
        };
    }

    async put(subscription: typesV2.StudentSubscriptions) {
        const key = getStudentSubscriptionKey(subscription.studentId);
        const updateEpoc = moment().toDate().getTime();
        
        await Promise.all([
            this.data.put<StoredSubscriptionConfig>({
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                studentId: subscription.studentId,
                license: subscription.license,
                lpk: `${subscription.license}#BS`,
                lsk: `P#${subscription.studentId}`,
                tsk: 'BS',
                notifications: subscription.notifications.map(x => ({
                    name: x.name,
                    behaviorIds: x.behaviorIds,
                    responseIds: x.responseIds,
                    notifyUntilResponse: x.notifyUntilResponse,
                    userIds: x.userIds,
                    emails: x.emails.length > 0,
                    mobiles: x.mobiles.length > 0,
                    deviceIds: x.deviceIds,
                    messages: {
                        default: x.messages.default? true : false,
                        app: x.messages.app? true : false,
                        email: x.messages.email? true : false,
                        text: x.messages.text? true : false
                    }
                })),
                updateEpoc,
                version: 1
            }),
            this.primary.put<StoredSubscriptionPii>({
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                studentId: subscription.studentId,
                license: subscription.license,
                lpk: `${subscription.license}#BS`,
                lsk: `P#${subscription.studentId}`,
                tsk: 'BS',
                notifications: subscription.notifications.map(x => ({
                    name: x.name,
                    emails: x.emails,
                    mobiles: x.mobiles,
                    messages: x.messages
                })),
                updateEpoc,
                version: 1
            })
        ]);
    }

    async remove(studentId: string) {
        const key = getStudentSubscriptionKey(studentId);
        
        await Promise.all([
            this.data.delete(key),
            this.primary.delete(key)
        ]);
    }
}

export const NotificationDal = new NotificationDalClass();
