import { v2, WebUtils } from '@mytaptrack/lib';
import { EventBridgeEvent } from 'aws-lambda';

interface ActionItems {
    removeIds: string[];
    addIds: string[];
}

export const handleEvent = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<'license', v2.MttUpdateEvent<v2.LicenseStorage>>) {
    WebUtils.logObjectDetails(event);
    const oldLicense = event.detail.data.old;
    const newLicense = event.detail.data.new;

    const actions = await getActions(oldLicense, newLicense);

    console.log('Adding emails');
    for(let x of actions.addIds) {
        await modifyUser(newLicense, x, true);
    }
    console.log('Removing emails');
    for(let x of actions.removeIds) {
        await modifyUser(oldLicense, x, false);
    }
}

export async function getActions(oldLicense: v2.LicenseStorage, newLicense: v2.LicenseStorage): Promise<ActionItems> {
    let removeEmails: string[] = [];
    let addEmails: string[] = [];
    const currentAdmins = await v2.UserDal.getAdminsForLicense(newLicense?.license || oldLicense?.license);


    if(oldLicense && oldLicense.details.admins && newLicense && newLicense.details.admins) {
        console.log('Diffing admins for removal');
        removeEmails = oldLicense.details.admins.filter(old => {
            return currentAdmins.find(admin => admin.email == old) &&
                !newLicense.details.admins.find(newAdmin => newAdmin == old);
        });

        console.log('Diffing admins for addition');
        addEmails = newLicense.details.admins.filter(email => {
            return !currentAdmins.find(admin => admin.email == email);
        });
    } else if(oldLicense && oldLicense.details.admins) {
        console.log('Removing old admins')
        removeEmails = oldLicense.details.admins.filter(email => {
            return !newLicense?.details.admins?.find(admin => admin == email);
        });
    } else if(newLicense && newLicense.details.admins) {
        console.log('Adding new admins')
        addEmails = newLicense.details.admins.filter(email => {
            return !currentAdmins.find(admin => admin.email == email);
        });
    }

    const addUserIds = ([] as string[]).concat(...await Promise.all(addEmails.map(x => v2.UserDal.getUserIdsByEmail(x))));

    const retval = {
        removeIds: removeEmails.map(x => {
            const existing = currentAdmins.find(y => y.email == x);
            return existing!.username;
        }),
        addIds: addUserIds.filter(x => x? true : false)
    };

    console.log(retval);
    return retval;
}

async function modifyUser(license: v2.LicenseStorage, userId: string, addLicense: boolean) {
    if(addLicense) {
        console.log('Updating user table');
        await v2.UserDal.addUserToLicense(userId, license.license);
    } else {
        console.log('Removing license from user');
        await v2.UserDal.removeUserFromLicense(userId, license.license);
    }
}
