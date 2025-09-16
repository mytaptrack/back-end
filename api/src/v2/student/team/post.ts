import { v2, WebError, WebUserDetails, WebUtils } from '@mytaptrack/lib';
import { typesV2, UserSummary, UserSummaryStatus } from '@mytaptrack/types';

export const handleEvent = WebUtils.apiWrapperEx(handler, {
    schema: typesV2.TeamPostRequestSchema
});

/**
 * Handles team invite acceptance/rejection
 * 
 * IMPORTANT: This function handles two types of invite records:
 * 1. Email-based invites (UserTeamInviteStorage): U#email -> S#studentId#I
 * 2. Pending team members (UserStudentTeam with PendingApproval status)
 * 
 * When accepting an invite, we must clean up BOTH types to prevent
 * invites from reappearing on subsequent logins.
 */

export async function handler (request: typesV2.TeamPostRequest, userDetails: WebUserDetails) {
    console.log('Getting student id');
    const studentId = request.studentId;

    console.log('Check all flag');
    if(request.all) {
        const invites = await v2.UserDal.getUserTeamInvites(userDetails.userId, userDetails.email);

        await Promise.all(invites.map(async invite => {
            await handler({
                ...JSON.parse(JSON.stringify(request)),
                studentId: invite.details.studentId,
                all: false
            }, userDetails);
        }));
        return;
    }

    console.log('Processing team invite for student:', studentId, 'user:', userDetails.userId, 'accepted:', request.accepted);

    if(request.accepted) {
        if(!request.studentId) {
            throw new WebError('Student ID is required', 400);
        }
        const [userInvite, student, existingTeamMember] = await Promise.all([
            v2.UserDal.getUserTeamInvite(userDetails.email, studentId).catch(err => {
                console.log('No email-based invite found:', err.message);
                return null;
            }),
            v2.StudentDal.getStudentConfig(studentId),
            // Check for existing team member record with pending status
            v2.TeamDal.getTeamMember(userDetails.userId, studentId, false).catch(err => {
                console.log('No existing team member found:', err.message);
                return null;
            })
        ]);

        console.log('Invite sources found:', {
            emailInvite: !!userInvite,
            pendingTeamMember: existingTeamMember?.status === UserSummaryStatus.PendingApproval
        });

        // Determine restrictions from either invite source
        let restrictions = userInvite?.restrictions;
        if (!restrictions && existingTeamMember?.status === UserSummaryStatus.PendingApproval) {
            restrictions = existingTeamMember.restrictions;
        }

        if (restrictions) {
            console.log('Creating verified team member');
            const team: UserSummary = {
                userId: userDetails.userId,
                studentId,
                status: typesV2.UserSummaryStatus.Verified,
                restrictions,
                license: student.license,
                details: {
                    email: userDetails.email,
                    name: userDetails.name
                },
                version: 1
            };

            // Clean up ALL invite records and create verified team member
            const cleanupPromises = [
                v2.TeamDal.putTeamMember(team),
                // Always try to delete email-based invite (won't error if doesn't exist)
                v2.UserDal.deleteUserTeamInvite(userDetails.email, request.studentId).catch(err => {
                    console.log('Email invite cleanup (expected if no email invite):', err.message);
                }),
                // Also clean up any invite records using userId instead of email
                v2.UserDal.deleteUserTeamInvite(userDetails.userId, request.studentId).catch(err => {
                    console.log('UserId invite cleanup (expected if no userId invite):', err.message);
                })
            ];

            await Promise.all(cleanupPromises);
            
            console.log('Team invite accepted and all records cleaned up successfully');
        } else {
            console.log('No valid invite found for user');
            throw new WebError('No valid invitation found', 404);
        }
    } else {
        console.log('Invitation not accepted - cleaning up all invite records');
        const cleanupPromises = [
            v2.TeamDal.removeUserFromTeam(userDetails.userId, request.studentId).catch(err => {
                console.log('Team member removal (expected if no team member):', err.message);
            }),
            v2.UserDal.deleteUserTeamInvite(userDetails.email, request.studentId).catch(err => {
                console.log('Email invite cleanup (expected if no email invite):', err.message);
            }),
            v2.UserDal.deleteUserTeamInvite(userDetails.userId, request.studentId).catch(err => {
                console.log('UserId invite cleanup (expected if no userId invite):', err.message);
            })
        ];

        await Promise.all(cleanupPromises);
        console.log('All invite records cleaned up after rejection');
    }
}
