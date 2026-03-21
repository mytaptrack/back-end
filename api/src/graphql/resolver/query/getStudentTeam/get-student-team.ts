import { LoggingLevel, MttLogger, TeamDal, UserDal, WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { AccessLevel, QLUserSummary, QLTeamMember } from '@mytaptrack/types';

const logger = MttLogger.getLogger('GetStudentTeam', LoggingLevel.debug);

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(event: MttAppSyncContext<{ studentId: string }, never, never, {}>) {
    
    // Convert GraphQL event to REST API event format
    logger.info('Getting student id');
    const { studentId } = event.arguments;

    logger.info('Checking if user is on students team');
    if(event.stash.permissions.student.devices == AccessLevel.none) {
        throw new Error('Access Denied');
    }
    
    const team = await TeamDal.getTeam(studentId);
    logger.debug('team', team);

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
    logger.debug('retval', retval);
    return retval.filter(t => t? true : false);
}
