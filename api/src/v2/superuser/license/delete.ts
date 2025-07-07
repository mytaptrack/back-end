import { v2, WebError, WebUserDetails, WebUtils } from '@mytaptrack/lib';

export const handleEvent = WebUtils.apiWrapperEx(deleteEvent, { 
    processBody: 'Parameters', 
    role: 'admins'
});

export async function deleteEvent(request: { license: string }, userDetails: WebUserDetails) {
    if(!request) {
        throw new WebError('Invalid input');
    }
    console.log('Deleting data');
    await v2.LicenseDal.delete(JSON.parse(request.license));
    console.log('Data deleted');

    console.log('Returning success');
    return { success: true };
}