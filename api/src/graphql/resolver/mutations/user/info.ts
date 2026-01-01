import {
    WebUtils, UserPrimaryStorage, getUserPrimaryKey, UserDataStorage,
    getUserStudentSummaryKey, UserStudentTeam, UserDal, StudentDal,
    MttAppSyncContext, moment,
    WebError,
    StudentConfigStorage,
    getStudentPrimaryKey, Dal,
    MttLogger,
    LoggingLevel
} from '@mytaptrack/lib';
import {
    AccessLevel,
    QLUserSummary, QLUserUpdate, QLUserUpdateStudent, UserSummaryStatus
} from '@mytaptrack/types';
import {
    TransactWriteCommand, TransactWriteCommandInput
} from '@aws-sdk/lib-dynamodb';

const logger = MttLogger.getLogger('UpdateUser', LoggingLevel.info);
const dataDal = new Dal('data');
const primaryDal = new Dal('primary');

export interface AppSyncParams {
    user: QLUserUpdate;
    terms: string;
}

interface UserData {
    config: UserDataStorage;
    pii: UserPrimaryStorage;
}

function cleanObject(obj: any) {
    if(!obj) {
        return;
    }

    if(typeof obj == 'object') {
        Object.keys(obj).forEach(key => {
            if(obj[key] == undefined) {
                delete obj[key];
            }
            cleanObject(obj[key]);
        });
    }

    return obj;
}

export const handler = WebUtils.graphQLWrapper(handleEvent);

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<QLUserSummary> {
    logger.log('Processing updating app');
    const user = context.arguments.user;
    const licenses = context.identity.groups?.filter(x => x.startsWith('licenses/'))?.map(x => x.substring('licenses/'.length));

    let userData = await getUserData(user.id);

    if(!userData.pii) {
        logger.info('Getting user by email');
        const userIds = await UserDal.getUserIdsByEmail(user.email);
        if(userIds?.length > 0) {
            logger.info('User id found');
            userData = await getUserData(userIds[0]);
        }
        if(!userData.pii) {
            if(user.id == context.identity.username) {
                logger.info('Creating current user');
                await createUser(context.identity.username, user);
                user.id = context.identity.username;
                return user;
            } else {
                logger.info('Checking if email as id exists');
                userData = await getUserData(user.email);
                if(!userData.pii) {
                    logger.info('Email as id does not exist, creating it for temporary information');
                    await createUser(user.email, user);

                    user.id = user.email;
                    userData = await getUserData(user.id);
                }
            }
        } else {
            user.id = userData.pii.userId;
        }
    } else {
        user.id = userData.pii.userId;
    }
    
    logger.info('Updating user information');
    await updateUser(context.identity.username, user, userData, licenses);

    return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        name: user.name,
        state: user.state,
        zip: user.zip,
        terms: userData.config.terms,
        students: user.students
    };
}

async function getUserData(userId: string): Promise<UserData> {
    const userKey = getUserPrimaryKey(userId);
    const [pii, config] = await Promise.all([
        primaryDal.get<UserPrimaryStorage>(userKey),
        dataDal.get<UserDataStorage>(userKey)
    ]);

    return {
        config,
        pii
    }
}

async function createUser(sourceUserId: string, user: QLUserUpdate) {
    const key = getUserPrimaryKey(sourceUserId);
    const transactionParams: TransactWriteCommandInput = {
        TransactItems: [
            {
                Put: {
                    TableName: primaryDal.tableName,
                    Item: cleanObject({
                        ...key,
                        pksk: `${key.pk}#${key.sk}`,
                        details: {
                            firstName: user.firstName,
                            lastName: user.lastName,
                            name: user.name,
                            email: user.email,
                            state: 'N/A',
                            zip: 'N/A'
                        },
                        userId: sourceUserId,
                        usk: 'P',
                        version: 1
                    } as UserPrimaryStorage)
                }
            },
            {
                Put: {
                    TableName: dataDal.tableName,
                    Item: cleanObject({
                        ...key,
                        pksk: `${key.pk}#${key.sk}`,
                        userId: sourceUserId,
                        usk: 'P',
                        events: [],
                        terms: undefined,
                        tags: [],
                        license: undefined,
                        licenseDetails: undefined,
                        version: 1
                    } as UserDataStorage)
                }
            }
        ]
    };
    
    if(transactionParams.TransactItems.length > 0) {
        const transaction = new TransactWriteCommand(transactionParams);
        await dataDal.send(transaction);
    }
}

async function updateUser(inviteUserId: string, user: QLUserUpdate, userData: UserData, licenses: string[]) {
    const pii = userData.pii;

    const transaction: TransactWriteCommandInput = {
        TransactItems: []
    };

    logger.debug('UserId: ', user.email);
    logger.debug('Pii UserId: ', userData.pii.userId);
    logger.debug('InviteUserId: ', inviteUserId);
    if( (user.email == userData.pii.userId || user.id == inviteUserId) &&
        (
            pii.details.firstName != user.firstName || 
            pii.details.lastName != user.lastName || 
            pii.details.name != user.name ||
            pii.details.state != user.state ||
            pii.details.zip != user.zip
        )) {
        transaction.TransactItems.push({
            Update: {
                TableName: primaryDal.tableName,
                Key: { pk: pii.pk, sk: pii.sk },
                UpdateExpression: 'set details = :details',
                ExpressionAttributeValues: {
                    ':details': {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        name: user.name,
                        email: user.email,
                        state: user.state,
                        zip: user.zip
                    }
                }
            }
        });
    }

    await Promise.all(user.students?.map(s => addStudentTransaction(inviteUserId, user, s, transaction, licenses)));

    if(transaction.TransactItems.length > 0) {
        await dataDal.send(new TransactWriteCommand(transaction));
    }
}

async function addStudentTransaction(inviteUserId: string, user: QLUserUpdate, student: QLUserUpdateStudent, transaction: TransactWriteCommandInput, licenses: string[]) {
    const studentConfig = await dataDal.get<StudentConfigStorage>(getStudentPrimaryKey(student.studentId), 'license');

    if(!studentConfig) {
        logger.info('Student does not exist');
        throw new WebError('Access Denied');
    }

    logger.debug('Licenses: ', licenses);
    logger.debug('Student license: ', studentConfig.license);
    if(!licenses?.includes(studentConfig.license)) {
        const inviterPermissions = await dataDal.get<UserStudentTeam>(
            getUserStudentSummaryKey(student.studentId, inviteUserId), 
            'restrictions, removed');
        
        if(!inviterPermissions || inviterPermissions?.deleted || inviterPermissions?.restrictions.team != AccessLevel.admin) {
            logger.error('User does not have access to student');
            throw new WebError('Access Denied');
        }
    }

    const team = await dataDal.get<UserStudentTeam>(
        getUserStudentSummaryKey(student.studentId, user.id), 
        '#status, #role, restrictions, license, serviceTracking, behaviorTracking, removed', 
        { '#status': 'status', '#role': 'role'});

    const key = getUserStudentSummaryKey(student.studentId, user.id);
    if(!student.deleted) {
        if(!team) {
            const studentConfig = await StudentDal.getStudentConfig(student.studentId);
            transaction.TransactItems.push({
                Put: {
                    TableName: dataDal.tableName,
                    Item: cleanObject({
                        ...key,
                        pksk: `${key.pk}#${key.sk}`,
                        userId: user.id,
                        usk: `S#${student.studentId}`,
                        studentId: student.studentId,
                        tsk: `U#${user.id}`,
                        lpk: `${studentConfig.license}#T`,
                        lsk: `${user.id}#${student.studentId}`,
                        license: studentConfig.license,
                        date: new Date().getTime(),
                        restrictions: student.restrictions,
                        behaviorTracking: student.behaviors,
                        serviceTracking: student.services,
                        status: UserSummaryStatus.PendingApproval,
                        requester: inviteUserId,
                        version: 2
                    } as UserStudentTeam)
                }
            });
        } else {
            transaction.TransactItems.push({
                Update: {
                    TableName: dataDal.tableName,
                    Key: key,
                    UpdateExpression: 'SET restrictions = :restrictions, behaviorTracking = :behaviorTracking, serviceTracking = :serviceTracking REMOVE deleted',
                    ExpressionAttributeValues: {
                        ':restrictions': student.restrictions,
                        ':behaviorTracking': student.behaviors,
                        ':serviceTracking': student.services
                    }
                }
            });
        }
    } else if(team && !team.deleted) {
        transaction.TransactItems.push({
            Update: {
                TableName: dataDal.tableName,
                Key: key,
                UpdateExpression: 'SET deleted = :deleted, removed = :removed',
                ExpressionAttributeValues: {
                    ':deleted': true,
                    ':removed': moment().format('yyyy-MM-DDThh:mm:ss a')
                }
            }
        });
    } else {
        logger.error('No action taken as team not found');
    }
}