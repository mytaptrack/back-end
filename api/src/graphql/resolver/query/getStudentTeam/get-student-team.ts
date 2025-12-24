import { TeamDal, UserDal, WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { AccessLevel, QLUserSummary, QLTeamMember } from '@mytaptrack/types';

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(event: MttAppSyncContext<{ studentId: string }, never, never, {}>) {
    
    // Convert GraphQL event to REST API event format
    console.log('Getting student id');
    const { studentId } = event.arguments;

    console.log('Checking if user is on students team');
    if(event.stash.permissions.student.devices == AccessLevel.none) {
        throw new Error('Access Denied');
    }
    
    const team = await TeamDal.getTeam(studentId);

    const retval: QLTeamMember[] = await Promise.all(team.map(async t => {
        if(t.deleted) {
            return;
        }
        return {
            userId: t.userId,
            email: t.details.email,
            name: t.details.name,
            restrictions: t.restrictions,
            status: t.status
        } as QLTeamMember;
    }))
    return retval.filter(t => t? true : false);
}
