import { LoggingLevel, MttLogger, TeamDal, WebUtils } from '@mytaptrack/lib';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { AccessLevel } from '@mytaptrack/types';

const logger = MttLogger.getLogger('DeleteTeamMember', LoggingLevel.debug);
export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(event: MttAppSyncContext<{ studentId: string, userId: string }, never, never, {}>) {
    
    const { studentId, userId } = event.arguments;

    logger.info('Checking if user has team management permissions');
    if(event.stash.permissions.student.team == AccessLevel.none) {
        throw new Error('Access Denied');
    }
    
    logger.info(`Removing user ${userId} from student ${studentId} team`);
    await TeamDal.removeUserFromTeam(userId, studentId);

    return true;
}
