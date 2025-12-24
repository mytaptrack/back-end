import {
    WebUtils, UserDataStorage, getUserPrimaryKey, UserPrimaryStorage, LicenseStorage, getLicenseKey, UserTeamInviteStorage, UserDal,
    getStudentPrimaryKey, StudentPiiStorage,
    UserStudentTeam
} from '@mytaptrack/lib';
import {
    AccessLevel,
    QLUser, QLUserMajorFeatures,
    UserSummaryStatus, QLUserInvite
} from '@mytaptrack/types';
import { MttAppSyncContext } from '@mytaptrack/cdk';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';

const data = new Dal('data');
const primary = new Dal('primary');

interface QueryParams {
    license: string;
}

export const handler = WebUtils.graphQLWrapper(eventHandler);

export async function eventHandler(context: MttAppSyncContext<QueryParams, any, any, {}>): Promise<QLUser> {
    console.log('Getting users');
    const username = context.identity?.username || 'local-test-user';
    const key = getUserPrimaryKey(username);
    console.log('[getUser] Fetching user data for:', username, 'key:', key);
    const [userPii, config, students] = await Promise.all([
        primary.get<UserPrimaryStorage>(key),
        data.get<UserDataStorage>(key),
        data.query<UserStudentTeam>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            filterExpression: 'attribute_not_exists(#removed) and attribute_not_exists(#deleted)',
            attributeNames: {
                '#removed': 'removed',
                '#deleted': 'deleted'
            },
            attributeValues: {
                ':pk': key.pk,
                ':sk': 'S#'
            },
        })
    ]);

    console.log('[getUser] Initial fetch complete - userPii:', !!userPii, 'config:', !!config, 'students:', students?.length);
    console.debug('students: ', students);
    const license = config?.license? await data.get<LicenseStorage>(getLicenseKey(config.license)) : undefined;
    console.log('[getUser] License fetch complete:', !!license);

    let userPiiData: UserPrimaryStorage = userPii;
    let userConfigData: UserDataStorage = config;

    if(!userPii) {
        console.log('[getUser] No userPii found, fetching by email');
        let email: string;
        
        // In local mode, username is the email (no Cognito lookup needed)
        if (process.env.USE_LOCAL === 'true' || !process.env.UserPoolId) {
            email = username.replace('-at-', '@');
            console.log('[getUser] Local mode - using username as email:', email);
        } else {
            email = await UserDal.getEmailByUserId(username);
            console.log('[getUser] Email lookup result:', email);
        }
        
        let emailKey = { pk: `U#${email}`, sk: 'P'};
        const [userPiiEmail, configEmail] = await Promise.all([
            primary.get<UserPrimaryStorage>(emailKey),
            data.get<UserDataStorage>(emailKey)
        ]);
        console.log('[getUser] Email-based fetch complete - userPiiEmail:', !!userPiiEmail, 'configEmail:', !!configEmail);
        if(!userPiiEmail) {
            return {
                id: username,
                firstName: '',
                lastName: '',
                email,
                name: '',
                state: '',
                zip: '',
                terms: '',
                majorFeatures: {
                    license: '',
                    behaviorTracking: false,
                    serviceTracking: false,
                    tracking: false,
                    manage: false
                },
                invites: []
            };
        }
        userPiiData = userPiiEmail;
        userConfigData = configEmail;
    } else {
        console.log('[getUser] UserPii found, fetching student invites');
        const emailKey = getUserPrimaryKey(userPii.details.email);
        console.log('[getUser] Email key for invites:', emailKey);
        const studentInvites = await data.query<UserStudentTeam>({
            keyExpression: 'pk = :pk and begins_with(sk, :sk)',
            filterExpression: 'attribute_not_exists(#removed) and attribute_not_exists(#deleted)',
            attributeNames: {
                '#removed': 'removed',
                '#deleted': 'deleted'
            },
            attributeValues: {
                ':pk': emailKey.pk,
                ':sk': 'S#'
            },
        });

        console.log('[getUser] Student invites fetched:', studentInvites?.length);
        students.push(...studentInvites);
    }

    const majorFeatures: QLUserMajorFeatures = {
        license: license? license.license : '',
        behaviorTracking: false,
        serviceTracking: false,
        tracking: false,
        manage: false
    };

    if(license) {
        majorFeatures.behaviorTracking = license.details.features.behaviorTracking? true : false;
        majorFeatures.serviceTracking = license.details.features.serviceTracking? true : false;
        majorFeatures.manage = license.details.features.manage? true : false;
        majorFeatures.tracking = true;
    }

    students?.forEach(x => {
        if(x.behaviorTracking) {
            majorFeatures.behaviorTracking = true;
        }
        if(x.serviceTracking) {
            majorFeatures.serviceTracking = true;
        }
        if(x.restrictions.data == AccessLevel.admin) {
            majorFeatures.tracking = true;
        }
    });

    const invitedStudents = students.filter(x => x.status != UserSummaryStatus.RemovalPending && x.status != UserSummaryStatus.Verified);
    console.log('[getUser] Fetching PII for invited students:', invitedStudents.length);
    const spiis: StudentPiiStorage[] = invitedStudents.length > 0? await Promise.all(invitedStudents.map(x => primary.get<StudentPiiStorage>(getStudentPrimaryKey(x.studentId), 'firstName,lastName,nickname,studentId'))) : [];
    console.log('[getUser] Student PII fetch complete:', spiis.length);

    console.log('[getUser] Returning user data for:', username);
    return {
        id: username,
        firstName: userPiiData.details.firstName,
        lastName: userPiiData.details.lastName,
        name: userPiiData.details.name,
        email: userPiiData.details.email,
        state: userPiiData.details.state,
        zip: userPiiData.details.zip,
        terms: userConfigData.terms,
        majorFeatures,
        invites: invitedStudents.map(x => {
            const pii = spiis.find(y => y.studentId == x.studentId);
            return {
                studentId: x.studentId,
                name: pii? (pii.nickname || `${pii.firstName} ${pii.lastName}`) : 'Unknown',
                status: x.status
            } as QLUserInvite;
        })
    };
}
