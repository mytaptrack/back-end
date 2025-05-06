import { 
    AdminAddUserToGroupCommand,
    AdminGetUserCommand,
    AdminRemoveUserFromGroupCommand,
    CognitoIdentityProviderClient, CreateGroupCommand, GetGroupCommand, GetGroupCommandOutput, ListUsersCommand, ListUsersInGroupCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { 
    NotificationDetailsTeam, User, UserSummaryStatus, Notification,
    NotificationType, NotificationDetails, LicenseDetails
} from '@mytaptrack/types';
import { 
    UserPrimary, UserData, UserStudentTeam, 
    UserPrimaryStorage, UserDataStorage,
    UserTeamInvite, UserTeamInviteStorage, UserStudentSummary, 
    StudentPiiStorage, UserStudentNotificationStorage, isEqual
} from '../types';
import { DalBaseClass } from './dal';
import { getStudentPrimaryKey, getUserPrimaryKey, getUserStudentNotificationKey, getUserTeamInvite, moment } from '../..';
import { WebUtils } from '../..';
import { MttTag } from '@mytaptrack/types';

const UserPoolId = process.env.UserPoolId;

interface UserIdStorage {
    pk: string;
    sk: string;
    userId: string;
}

class UserDalClass extends DalBaseClass {
    public cognito = new CognitoIdentityProviderClient({});

    async getUserId(email: string, defaultUserId: string) {
        const key = { pk: `U#${email.toLowerCase()}#E`, sk: 'P'};
        const userIdLookup = await this.data.get<UserIdStorage>(key, 'userId');

        if(userIdLookup) {
            return userIdLookup.userId;
        }

        if(defaultUserId.startsWith('accounts.google.com')) {
            defaultUserId = defaultUserId.replace('accounts.google.com', 'Google');
        }

        await this.data.put({
            ...key,
            userId: defaultUserId
        });
        return defaultUserId;
    }

    async getUsersForLicense(license: string): Promise<{username: string, email: string}[]> {
        const groupName = `licenses/${license}/users`;
        const cognitoResult = await this.cognito.send(new ListUsersInGroupCommand({
            UserPoolId,
            GroupName: groupName
        }));

        if (!cognitoResult.Users || !cognitoResult.Users[0]) {
            return [];
        }
        const users = cognitoResult.Users.map(x => ({ 
            username: x.Username, 
            email: x.Attributes.find(y => y.Name === 'email').Value 
        }));
        return users;
    }

    async getAdminsForLicense(license: string) {
        const retval: { username: string, email: string }[] = [];
        const GroupName = `licenses/${license}`;
        let NextToken;
        try {
            do {
                const response =  await this.cognito.send(new ListUsersInGroupCommand({
                    UserPoolId,
                    GroupName,
                    NextToken
                }));
                NextToken = response.NextToken;
                if(response.Users) {
                    retval.push(...response.Users.map(x => {
                        return {
                            username: x.Username,
                            email: x.Attributes.find(y => y.Name == 'email').Value
                        };
                    }));
                }
            } while ( NextToken );
        } catch (err) {
            if(err.Code != 'ResourceNotFoundException') {
                throw err;
            }
        }
        return retval;
    }

    async addUserToLicense(userId: string, license: string) {
        const groupName = `licenses/${license}`;
        console.log('Getting group', groupName);
        let group: GetGroupCommandOutput = undefined;
        try {
            group = await this.cognito.send(new GetGroupCommand({
                UserPoolId,
                GroupName: groupName
            }));
        } catch (err) {
            
        }
        if(!group?.Group) {
            console.log('Creating group', groupName);
            await this.cognito.send(new CreateGroupCommand({
                UserPoolId,
                GroupName: groupName
            }));
        }

        console.log('Adding user to group', groupName);
        await this.cognito.send(new AdminAddUserToGroupCommand({
            Username: userId,
            GroupName: groupName,
            UserPoolId
        }));
    }
    async removeUserFromLicense(userId: string, license: string) {
        const groupName = `licenses/${license}`;
        await this.cognito.send(new AdminRemoveUserFromGroupCommand({
            Username: userId,
            GroupName: groupName,
            UserPoolId
        }));
    }

    async getEmailByUserId(userId: string): Promise<string> {
        const cognitoResult = await this.cognito.send(new AdminGetUserCommand({
            UserPoolId,
            Username: userId
        }));

        return cognitoResult.UserAttributes.find(x => x.Name === 'email')?.Value;
    }
    async getUserIdsByEmail(email: string): Promise<string[]> {
        const cognitoResult = await this.cognito.send(new ListUsersCommand({
            UserPoolId,
            Filter: `"email" = "${email}"`
        }));

        if (!cognitoResult.Users || !cognitoResult.Users[0]) {
            return null;
        }
        const userIds = cognitoResult.Users.map(x => x.Username);
        return userIds;
    }
    async getUserByEmail(email: string): Promise<User> {
        const userId = await this.getUserIdsByEmail(email);
        if(!userId || !userId[0]) {
            return;
        }
        return await this.getUser(userId[0], email);
    }

    async getUserStudentStats(userId: string): Promise<UserStudentSummary[]>  {
        try {
            const key = getUserPrimaryKey(userId);
            const data = await this.data.get<UserData>(key, 'events');

            if(!data) {
                return;
            }
            return data.events;
        } catch (err) {
            const message = err.message;
            console.log('An error occured retrieving the user', message);
            throw new Error('Internal Error');
        }
    }

    async getUserConfig(userId: string) {
        const key = getUserPrimaryKey(userId);
        const result = await this.data.get<UserData>(key, 'events,license,tags,terms');
        return result;
    }
    async getUserPii(userId: string) {
        const key = getUserPrimaryKey(userId);
        const result = await this.primary.get<UserPrimaryStorage>(key, 'details');
        return result;
    }

    async updateUserEvent(userId: string, event: UserStudentSummary | null, index?: number) {
        const key = getUserPrimaryKey(userId);
        if(index == undefined) {
            await this.data.update({
                key,
                updateExpression: 'SET #events = list_append(#events, :event)',
                attributeValues: {
                    ':event': [event]
                },
                attributeNames: {
                    '#events': 'events'
                }
            });
        } else {
            if(event) {
                await this.data.update({
                    key,
                    updateExpression: `SET #events[${index}] = :event`,
                    attributeValues: {
                        ':event': event
                    },
                    attributeNames: {
                        '#events': 'events'
                    }
                });
            } else {
                await this.data.update({
                    key,
                    updateExpression: `REMOVE #events[${index}]`,
                    attributeNames: {
                        '#events': 'events'
                    }
                });
            }
        }
    }

    async getUserTeamInvites(userId: string, email: string) {
        let [dataResponse, existingInvites] = await Promise.all([
            this.data.query<any>({
                keyExpression: 'pk = :pk',
                attributeNames: {
                    '#count': 'count',
                    '#awaitingResponse': 'awaitingResponse',
                    '#terms': 'terms',
                    '#restrictions': 'restrictions',
                    '#events': 'events',
                    '#deleted': 'deleted',
                    '#status': 'status',
                    '#archived': 'archived'
                },
                attributeValues: { ':pk': `U#${userId}` },
                projectionExpression: 'sk,studentId,#count,#awaitingResponse,#terms,#restrictions,#events,#status',
                filterExpression: 'attribute_not_exists(#deleted) and attribute_not_exists(#archived)'
            }),
            this.data.query<UserTeamInviteStorage>({
                keyExpression: 'pk = :pk and begins_with(sk, :sk)',
                attributeValues: {
                    ':pk': `U#${email?.toLowerCase()}`,
                    ':sk': `S#`
                },
                attributeNames: {
                    '#count': 'count',
                    '#awaitingResponse': 'awaitingResponse',
                    '#terms': 'terms',
                    '#restrictions': 'restrictions',
                    '#events': 'events',
                    '#deleted': 'deleted',
                    '#status': 'status',
                    '#archived': 'archived'
                },
                projectionExpression: 'sk,studentId,#count,#awaitingResponse,#terms,#restrictions,#events,#status',
                filterExpression: 'attribute_not_exists(#deleted) and attribute_not_exists(#archived)'
            })
        ]);

        WebUtils.logObjectDetails(existingInvites);

        if(existingInvites) {
            console.log('Merging invites');
            dataResponse.push(...existingInvites);
        }
        let invites: UserTeamInviteStorage[] = dataResponse.filter((x: {sk: string}) => x.sk.match(/^S#[0-9|a-z|\-]+#I$/)) as UserTeamInviteStorage[];
        let students: UserStudentTeam[] = dataResponse.filter((x: {sk: string}) => x.sk.match(/^S#[0-9|a-z|\-]+#S$/)) as UserStudentTeam[];
        const studentIds: string[] = [];
        invites.forEach(x => {
            if(!studentIds.find(y => x.studentId == y)) {
                studentIds.push(x.studentId);
            }
        });
        students.forEach(x => {
            if(!studentIds.find(y => x.studentId == y)) {
                studentIds.push(x.studentId);
            }
        });
        
        const batches: Promise<StudentPiiStorage[]>[] = [];
        for(let i = 0; i < studentIds.length; i += 100) {
            let length = 100;
            if(i + length > studentIds.length) {
                length = studentIds.length - i;
            }
            const keys = studentIds.slice(i, i + length).map(s => getStudentPrimaryKey(s));
            console.log('Getting student pii', keys.length);
            batches.push(this.primary.batchGet<StudentPiiStorage>(
                keys,
                'studentId,firstName,lastName,tags,lastTracked,lastUpdatedDate'));
        }
        const studentPiiResponse: StudentPiiStorage[] = [].concat(...await Promise.all(batches));
        let studentPiiLookup: StudentPiiStorage[] = studentPiiResponse.filter(x => x? true : false);
        console.log('Student pii count', studentPiiLookup.length);
        const teamInvites: Notification<NotificationDetailsTeam>[] = [].concat(
                students.filter(x => x.status == UserSummaryStatus.PendingApproval)
                    .map(i => {
                        const invitePii = studentPiiLookup.find(y => y.studentId == i.studentId);
                        if(!invitePii) {
                            console.log('Could not find pii', i.studentId);
                            return;
                        }
                        return {
                            date: moment().toDate().getTime(),
                            type: NotificationType.TeamInvite,
                            details: {
                                type: NotificationType.TeamInvite,
                                studentId: i.studentId,
                                firstName: invitePii.firstName,
                                lastName: invitePii.lastName,
                                access: i.restrictions
                            }
                        } as Notification<NotificationDetailsTeam>;
                    }),
                invites.map(i => {
                    const invitePii = studentPiiLookup.find(y => y.studentId == i.studentId);
                    if(!invitePii) {
                        console.log('Could not find pii', i.studentId);
                        return;
                    }
                    return {
                        date: i.date,
                        type: NotificationType.TeamInvite,
                        details: {
                            type: NotificationType.TeamInvite,
                            studentId: i.studentId,
                            firstName: invitePii.firstName,
                            lastName: invitePii.lastName,
                            access: i.restrictions
                        }
                    } as Notification<NotificationDetailsTeam>;
                }).filter(x => x)
            );

        return teamInvites;
    }

    async getUser(userId: string, email: string): Promise<User> {
        try {
            let [dataResponse, piiResponse, existingInvites] = await Promise.all([
                this.data.query<any>({
                    keyExpression: 'pk = :pk',
                    attributeNames: {
                        '#count': 'count',
                        '#awaitingResponse': 'awaitingResponse',
                        '#terms': 'terms',
                        '#restrictions': 'restrictions',
                        '#events': 'events',
                        '#deleted': 'deleted',
                        '#status': 'status',
                        '#archived': 'archived'
                    },
                    attributeValues: { ':pk': `U#${userId}` },
                    projectionExpression: 'sk,studentId,#count,#awaitingResponse,#terms,#restrictions,#events,#status',
                    filterExpression: 'attribute_not_exists(#deleted) and attribute_not_exists(#archived)'
                }),
                this.primary.get<UserPrimaryStorage>({ pk: `U#${userId}`, sk: 'P' }, 'details'),
                this.data.query<UserTeamInviteStorage>({
                    keyExpression: 'pk = :pk',
                    attributeValues: { ':pk': `U#${email?.toLowerCase()}`}
                })
            ]);
            // if(existingInvites && existingInvites.length > 0) {
            //     await Promise.all(existingInvites.map(x => this.saveUserInvite(userId, x.studentId, x)));
            // }

            if(!dataResponse) {
                dataResponse = [{
                    pk: '', sk: 'P', pksk: '',
                    userId, events: [], tags: [], terms: '',
                    license: undefined,
                    version: 1
                } as UserDataStorage,
                ...existingInvites];
            }
            if(!piiResponse) {
                piiResponse = {
                    details: {}
                } as any;
            }
            let pii: UserPrimary = piiResponse?.details? piiResponse.details : {} as any;
            let p: UserData = dataResponse.find(x => x.sk == 'P') as UserData;
            if(!p) {
                p = {} as any;
            }
            if(!p.events) {
                p.events = [];
            }
            let invites: UserTeamInviteStorage[] = dataResponse.filter((x: {sk: string}) => x.sk.match(/^S#[0-9|a-z|\-]+#I$/)) as UserTeamInviteStorage[];
            let students: UserStudentTeam[] = dataResponse.filter((x: {sk: string}) => x.sk.match(/^S#[0-9|a-z|\-]+#S$/)) as UserStudentTeam[];
            console.log(`Invites (${invites.length}), Students (${students.length})`);
            const studentIds: string[] = [];
            invites.forEach(x => {
                if(!studentIds.find(y => x.studentId == y)) {
                    studentIds.push(x.studentId);
                }
            });
            students.forEach(x => {
                if(!studentIds.find(y => x.studentId == y)) {
                    studentIds.push(x.studentId);
                }
            });
            const batches: Promise<StudentPiiStorage[]>[] = [];
            for(let i = 0; i < studentIds.length; i += 100) {
                let length = 100;
                if(i + length > studentIds.length) {
                    length = studentIds.length - i;
                }
                const keys = studentIds.slice(i, i + length).map(s => getStudentPrimaryKey(s));
                console.log('Getting student pii', keys.length);
                batches.push(this.primary.batchGet<StudentPiiStorage>(
                    keys,
                    'studentId, firstName, lastName, tags, lastTracked, lastUpdatedDate, archived'));
            }
            const studentPiiResponse: StudentPiiStorage[] = [].concat(...await Promise.all(batches));
            let studentPiiLookup: StudentPiiStorage[] = studentPiiResponse.filter(x => x && !x.archived);
            console.log('Student pii count', studentPiiLookup.length);
            console.log(studentPiiResponse.find(x => x.studentId == 'dc2a3551-40f6-4087-89ba-13b98763e595'));
            const user: User = {
                version: 1,
                userId,
                terms: p.terms,
                license: p.license,
                licenseDetails: p.licenseDetails,
                teamInvites: [].concat(
                    students.filter(x => x.status == UserSummaryStatus.PendingApproval)
                        .map(i => {
                            const invitePii = studentPiiLookup.find(y => y.studentId == i.studentId);
                            if(!invitePii) {
                                console.log('Could not find pii', i.studentId);
                                return;
                            }
                            return {
                                date: moment().toDate().getTime(),
                                type: NotificationType.TeamInvite,
                                details: {
                                    type: NotificationType.TeamInvite,
                                    studentId: i.studentId,
                                    firstName: invitePii.firstName,
                                    lastName: invitePii.lastName,
                                    access: i.restrictions
                                }
                            } as Notification<NotificationDetailsTeam>;
                        }),
                    invites.map(i => {
                        const invitePii = studentPiiLookup.find(y => y.studentId == i.studentId);
                        if(!invitePii) {
                            console.log('Could not find pii', i.studentId);
                            return;
                        }
                        if(invitePii.archived) {
                            console.log('Student archived', i.studentId);
                            return;
                        }
                        return {
                            date: i.date,
                            type: NotificationType.TeamInvite,
                            details: {
                                type: NotificationType.TeamInvite,
                                studentId: i.studentId,
                                firstName: invitePii.firstName,
                                lastName: invitePii.lastName,
                                access: i.restrictions
                            }
                        } as Notification<NotificationDetailsTeam>;
                    }).filter(x => x)
                ),
                details: {
                    firstName: pii.firstName,
                    lastName: pii.lastName,
                    name: pii.name,
                    email: pii.email?.toLowerCase(),
                    state: pii.state,
                    zip: pii.zip,
                },
                students: students
                    .filter(x => x.status == UserSummaryStatus.Verified)
                    .map(x => {
                        const studentPii = studentPiiLookup.find(y => y.studentId == x.studentId);
                        const summary = p.events.find(y => y.studentId == x.studentId);
                        if(!studentPii) {
                            console.log('Could not find pii', x.studentId);
                            return;
                        }
                        if(studentPii.archived) {
                            console.log('Student archived', x.studentId);
                            return;
                        }
                        if(studentPii.studentId == 'df06cb69-0517-4789-a6e9-8ee989ea66a4') {
                            console.log(studentPii);
                        }
                        let tracked: string = studentPii.lastTracked;
                        if (!tracked) {
                            tracked = studentPii.lastUpdatedDate;
                        } else if (studentPii.lastUpdatedDate && 
                            moment(tracked).isBefore(moment(studentPii.lastUpdatedDate))) {
                            tracked = studentPii.lastUpdatedDate;
                        }
                        const displayTags = (studentPii.tags?.filter(t => t.type != 'H').map(t => t.tag) || [])
                        return {
                            studentId: x.studentId,
                            firstName: studentPii.firstName,
                            lastName: studentPii.lastName,
                            tags: (studentPii.tags.map(t => t.tag) || []),
                            displayTags: displayTags,
                            lastTracked: tracked,
                            alertCount: summary? summary.count : 0,
                            awaitingResponse: summary? summary.awaitingResponse : false
                        }
                    }).filter(x => x? true : false)
            };

            return user;
        } catch (err) {
            console.log('An error occurred retrieving the user', err);
            throw new Error('Internal Error');
        }
    }

    async saveUserPii(userId: string, license: string, pii: UserPrimary) {
        const userKey = getUserPrimaryKey(userId);
        const dataModel: UserPrimaryStorage = {
            ...userKey,
            pksk: `${userKey.pk}#${userKey.sk}`,
            userId,
            usk: 'P',
            license,
            version: 1,
            details: pii
        };

        await this.primary.put(dataModel);
    }

    async saveUserConfig(userId: string, input: {license?: string, tags?: MttTag[], licenseDetails?: LicenseDetails }) {
        const key = getUserPrimaryKey(userId);
        const existing = await this.data.get<UserDataStorage>(key, 'pk,sk');
        if(!existing) {
            console.log('saveUserConfig','Putting new entry');
            await this.data.put({
                ...key,
                pksk: `${key.pk}#${key.sk}`,
                userId,
                usk: 'P',
                license: input.license,
                licenseDetails: input.licenseDetails? {
                    features: input.licenseDetails.features,
                    singleCount: input.licenseDetails.singleCount,
                    singleUsed: input.licenseDetails.singleUsed,
                    multiCount: input.licenseDetails.multiCount
                } : undefined,
                terms: new Date().toISOString(),
                events: [],
                tags: input.tags,
                version: 1
            } as UserDataStorage, true);
        } else {
            console.log('saveUserConfig','Updating existing entry');
            const updateInput = {
                key,
                updateExpression: 'SET ',
                attributeNames: {  },
                attributeValues: {  }
            }
            if(input.tags && !isEqual(existing.tags, input.tags)) {
                updateInput.updateExpression += ' #tags = :tags';
                updateInput.attributeNames['#tags'] = 'tags';
                updateInput.attributeValues[':tags'] = input.tags;
            }
            if(input.licenseDetails && !isEqual(existing.licenseDetails, input.licenseDetails)) {
                if(updateInput.updateExpression) {
                    updateInput.updateExpression += ', ';
                }
                updateInput.updateExpression += '#licenseDetails = :licenseDetails';
                updateInput.attributeNames['#licenseDetails'] = 'licenseDetails';
                updateInput.attributeValues[':licenseDetails'] = input.licenseDetails;
            }
            if(input.license && !isEqual(existing.license, input.license)) {
                if(updateInput.updateExpression) {
                    updateInput.updateExpression += ', ';
                }
                updateInput.updateExpression += '#license = :license';
                updateInput.attributeNames['#license'] = 'license';
                updateInput.attributeValues[':license'] = input.license;
            }
            await this.data.update(updateInput);
        }
    }


    async getUserTeamInvite(email: string, studentId: string) {
        const key = getUserTeamInvite(email?.toLowerCase(), studentId);
        const result = await this.data.get<UserTeamInviteStorage>(key, 'userId,studentId,restrictions');
        return result;
    }

    async deleteUserTeamInvite(email: string, studentId: string) {
        const key = getUserTeamInvite(email?.toLowerCase(), studentId);
        const result = await this.data.delete(key);
        return result;
    }

    async saveUserInvite(userId: string, studentId: string, invite: UserTeamInvite) {
        const key = getUserTeamInvite(userId, studentId);
        await this.data.put({
            ...invite,
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            userId,
            usk: `T#${studentId}#I`,
            studentId,
            tsk: `T#${userId}#I`,
            version: 1
        } as UserTeamInviteStorage);
    }

    async setStudentActiveNoResponse(userId: string, studentId: string, val: boolean) {
        const key = getUserPrimaryKey(userId);
        const userData = await this.data.get(key, 'events') as UserData;
        const index = userData.events.findIndex(x => x.studentId == studentId);
        if(index < 0) {
            await this.data.update({
                key,
                updateExpression: 'SET #events = list_append(#events, :val)',
                attributeNames: {
                    '#events': 'events'
                },
                attributeValues: {
                    ':val': [{
                        studentId: studentId,
                        count: 0,
                        awaitingResponse: val,
                    } as UserStudentSummary]
                }
            });
        } else {
            await this.data.update({
                key,
                updateExpression: `SET #events[${index}].#awaitingResponse = :val`,
                attributeNames: {
                    '#events': 'events',
                    '#awaitingResponse': 'awaitingResponse'
                },
                attributeValues: {
                    ':val': val
                }
            });
        }
    }

    async saveStudentBehaviorNotification(userId: string, studentId: string, event: Notification<NotificationDetails>) {
        const key = getUserStudentNotificationKey(userId, studentId, event.details.type, event.date);

        await this.data.put({
            ...key,
            pksk: `${key.pk}#${key.sk}`,
            userId: userId,
            usk: key.sk,
            studentId: studentId,
            event
        } as UserStudentNotificationStorage);
    }
    async deleteStudentBehaviorNotification(userId: string, studentId: string, event: Notification<NotificationDetails>) {
        const key = getUserStudentNotificationKey(userId, studentId, event.details.type, event.date);

        await this.data.delete(key);
    }

    async getStudentBehaviorNotifications(userId: string, studentId: string): Promise<Notification<NotificationDetails>[]> {
        const results = await this.data.query<UserStudentNotificationStorage>({
            keyExpression: `pk = :pk and begins_with(sk, :sk)`,
            attributeValues: {
                ':pk': `USN#${userId}`,
                ':sk': `S#${studentId}#T#`
            },
            projectionExpression: 'event'
        });

        return results.map(x => x.event);
    }


}

export const UserDal = new UserDalClass();
