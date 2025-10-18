import { v2, WebError, WebUserDetails, WebUtils } from '@mytaptrack/lib';
import { AccessLevel, typesV2 } from '@mytaptrack/types';

export const handleEvent = WebUtils.apiWrapperEx(handler, {
    schema: typesV2.TeamDeleteRequestSchema,
    processBody: 'Parameters'
});

export async function handler(request: typesV2.TeamDeleteRequest, userDetails: WebUserDetails) {
    console.log('Getting student id');
    const studentId = request.studentId;

    console.log('Checking if user is on students team');
    const student = await v2.TeamDal.getTeamMember(userDetails.userId, studentId, false);
    const isLicenseAdmin = student.license && userDetails.licenses?.includes(student.license);
    if (!isLicenseAdmin && student?.restrictions?.devices !== AccessLevel.admin) {
        throw new WebError('Access Denied');
    }

    // Get the user's email for proper invite cleanup
    const userToRemove = await v2.UserDal.getUserPii(request.userId);
    const userEmail = userToRemove.details.email;

    await Promise.all([
        v2.TeamDal.removeUserFromTeam(request.userId, request.studentId),
        // Clean up both potential invite keys (userId and email) with error handling
        v2.UserDal.deleteUserTeamInvite(request.userId, request.studentId).catch(err => {
            console.log('UserId invite cleanup (expected if no userId invite):', err.message);
        }),
        v2.UserDal.deleteUserTeamInvite(userEmail, request.studentId).catch(err => {
            console.log('Email invite cleanup (expected if no email invite):', err.message);
        })
    ]);
}
