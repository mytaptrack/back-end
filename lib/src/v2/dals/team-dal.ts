import { typesV2, UserSummary } from '@mytaptrack/types';
import { DalBaseClass, MttIndexes } from './dal';
import { getUserPrimaryKey, getUserStudentSummaryKey } from '../utils';
import { UserPrimaryStorage, UserStudentTeam } from '../types';

class TeamDalClass extends DalBaseClass {
    async getStudentsForUser(userId: string): Promise<UserSummary[]> {

        const results = await this.data.query<UserStudentTeam>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            attributeNames: {
                '#removed': 'removed'
            },
            attributeValues: {
                ':pk': `U#${userId}`,
                ':sk': 'S#',
            },
            filterExpression: 'attribute_not_exists(#removed)',
            projectionExpression: 'userId, studentId, restrictions,behaviorTracking,serviceTracking'
        });

        const retval: UserSummary[] = results
            .filter(x => x?.studentId)
            .map(x => ({
                userId: x.userId,
                studentId: x.studentId,
                restrictions: x.restrictions,
                behaviorTracking: x.behaviorTracking,
                serviceTracking: x.serviceTracking
            } as UserSummary));

        return retval;
    }

    async userHasAccess(userId: string, studentId: string): Promise<boolean> {
        console.log('Checking if user is on students team');
        const result = await this.data.get<UserStudentTeam>(getUserStudentSummaryKey(studentId, userId), 'pk,sk');
        console.log('Check retrieved', result);
        if (!result || result.removed) {
            console.error(`user ${userId} tried to retrieve student ${studentId}, and was not on team`);
            throw new Error('Access Denied');
            return;
        }

        return true;
    }

    async getTeamMember(userId: string, studentId: string, includePii?: boolean): Promise<typesV2.UserSummary> {
        console.log('Checking if user is on students team', userId, studentId);
        try {
            const result = await this.data.get<UserStudentTeam>(
                getUserStudentSummaryKey(studentId, userId), 
                '#status,#role,restrictions,license,serviceTracking,behaviorTracking', 
                { '#status': 'status', '#role': 'role'});

            if (!result || result.removed) {
                console.error(`user ${userId} tried to retrieve student ${studentId}, and was not on team`);
                throw new Error('Access Denied');
                return;
            }

            const pii: UserPrimaryStorage = includePii? await this.primary.get<UserPrimaryStorage>(getUserPrimaryKey(userId), 'details') : {} as any;

            if(result?.restrictions && !result.restrictions.documents) {
                result.restrictions.documents = result.restrictions.data;
            }
            console.log('Processing team member');
            const retval = {
                userId,
                studentId,
                status: result.status,
                details: {
                    email: pii.details?.email,
                    name: pii.details?.name
                },
                restrictions: result.restrictions,
                license: result.license,
                serviceTracking: result.serviceTracking,
                behaviorTracking: result.behaviorTracking,
                version: 1
            } as typesV2.UserSummary;

            return retval;
        } catch (err) {
            if (err.message === 'Access Denied') {
                throw err;
            }
            console.error(`Could not retrieve student ${studentId} for user ${userId}: ${err}`);
            throw new Error('Internal Error');
        }
    }

    async getTeam(studentId: string): Promise<typesV2.UserSummary[]> {
        console.log('Querying team');
        try {
            const data = await this.data.query<UserStudentTeam>({
                keyExpression: '#studentId = :studentId and begins_with(#tsk, :tsk)',
                filterExpression: 'attribute_not_exists(#removed)',
                indexName: MttIndexes.student,
                attributeNames: {
                    '#studentId': 'studentId',
                    '#tsk': 'tsk',
                    '#removed': 'removed',
                    '#status': 'status'
                },
                attributeValues: {
                    ':studentId': studentId,
                    ':tsk': 'T#'
                },
                projectionExpression: 'userId,#status,details,restrictions'
            });

            const retval = await Promise.all(data.map(async c => {
                let pii = await this.primary.get<UserPrimaryStorage>(getUserPrimaryKey(c.userId), 'details');
                if(!pii) {
                    pii = {
                        details: {
                            email: c.userId,
                            name: c.userId
                        }
                    } as any;
                }
                return {
                    studentId,
                    userId: c.userId,
                    status: c.status,
                    details: {
                        email: pii.details.email,
                        name: pii.details.name,
                    },
                    restrictions: c.restrictions,
                    version: 1
                } as typesV2.UserSummary;
            }));

            retval.forEach(result => {
                if(result?.restrictions && !result.restrictions.documents) {
                    result.restrictions.documents = result.restrictions.data;
                }    
            });
            return retval;
        } catch (err) {
            console.log('Could not get team for student', err);
            throw new Error('Internal Error');
        }
    }

    async putTeamMember(teamMember: typesV2.UserSummary): Promise<typesV2.UserSummary> {
        if (!teamMember.userId || !teamMember.studentId || !teamMember.restrictions) {
            throw new Error('Required parameters not present');
        }

        const key = getUserStudentSummaryKey(teamMember.studentId, teamMember.userId);
        const config = {
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            tsk: `T#${teamMember.userId}`,
            usk: `T#${teamMember.studentId}`,
            lpk: `${teamMember.license}#T`,
            lsk: `${teamMember.userId}#${teamMember.studentId}`,
            license: teamMember.license,
            studentId: teamMember.studentId,
            userId: teamMember.userId,
            restrictions: teamMember.restrictions,
            status: teamMember.status,
            version: 1
        } as UserStudentTeam;

        await this.data.put<UserStudentTeam>(config);
        return teamMember;
    }

    async removeUserFromTeam(userId: string, studentId: string) {
        try {
            const key = getUserStudentSummaryKey(studentId, userId);
            await this.data.update({
                key,
                updateExpression: 'set #removed = :removed, #deleted = :true',
                attributeNames: {
                    '#removed': 'removed',
                    '#deleted': 'deleted'
                },
                attributeValues: {
                    ':removed': new Date().toDateString(),
                    ':true': true
                }
            });

            console.log('user access removed');
        } catch (err) {
            console.error(`Could not remove permissions from user ${userId}: ${err}`);
            throw new Error('Internal Error');
        }
    }
}

function getAccessLevel(admin: boolean, read: boolean) {
    if (admin) {
        return typesV2.AccessLevel.admin;
    } else if (read) {
        return typesV2.AccessLevel.read;
    }
    return typesV2.AccessLevel.none;
}

export const TeamDal = new TeamDalClass();
