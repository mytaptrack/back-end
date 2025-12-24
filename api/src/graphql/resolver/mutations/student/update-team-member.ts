import { TeamDal, UserDal, WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { AccessLevel, QLTeamMember, QLTeamMemberInput, UserSummary, UserSummaryStatus } from '@mytaptrack/types';

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(event: MttAppSyncContext<{ studentId: string, teamMember: QLTeamMemberInput }, never, never, {}>): Promise<QLTeamMember> {
    const { teamMember, studentId } = event.arguments;

    console.log('Checking if user has team management permissions');
    if(event.stash.permissions.student.team != AccessLevel.admin) {
        throw new Error('Access Denied');
    }
    
    // Use details if provided, otherwise use direct fields
    const email = teamMember.details?.email || teamMember.email;
    const name = teamMember.details?.name || teamMember.name;
    
    if (!email || !name) {
        throw new Error('Email and name are required');
    }

    if(!teamMember.userId || teamMember.userId == email) {
        console.info('Getting user id from email');
        const user = await UserDal.getUserByEmail(email);
        if(user) {
            console.info('User information retrieved', user);
            teamMember.userId = user.userId;
        } else {
            console.info('User information not found');
        }
    }

    // Convert to UserSummary format for TeamDal
    const userSummary: UserSummary = {
        studentId: studentId,
        userId: teamMember.userId || email, // Use email as userId if not provided
        restrictions: teamMember.restrictions,
        status: teamMember.status || UserSummaryStatus.PendingVerification,
        license: event.stash.permissions.license,
        version: teamMember.version || 1,
        details: {
            email,
            name
        }
    };

    console.log(`Updating team member for student ${teamMember.studentId}`);
    const updatedMember = await TeamDal.putTeamMember(userSummary);

    return {
        userId: updatedMember.userId,
        email: email,
        name: name,
        restrictions: updatedMember.restrictions,
        status: updatedMember.status,
        version: updatedMember.version
    } as QLTeamMember;
}
