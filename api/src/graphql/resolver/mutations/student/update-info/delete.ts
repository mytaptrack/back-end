import {
    StudentConfigStorage, WebUtils, WebError, Dal, DalKey, 
    MttIndexes, getStudentPrimaryKey, getLicenseKey
} from '@mytaptrack/lib';

import {
    MttAppSyncContext
} from '@mytaptrack/cdk';

const primary = new Dal('primary');
const data = new Dal('data');

export interface AppSyncParams {
    studentIds: string[];
    license: string;
}

export const handler = WebUtils.graphQLWrapper(handleEvent, { student: {} });

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<boolean> {
    console.debug('Context ', context);
    
    await Promise.all(context.arguments.studentIds.map(s => deleteStudent(s, context.arguments.license)));

    const remainingCounts = await data.query({
        keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
        indexName: MttIndexes.license,
        attributeValues: {
            ':lpk': `L#${context.arguments.license}`,
            ':lsk': 'S#',
        },
        projectionExpression: 'pk, sk'
    });

    const singleUsed = remainingCounts.length;

    await data.update({
        key: getLicenseKey(context.arguments.license),
        updateExpression: 'SET #details.#singleUsed = :singleUsed',
        attributeNames: {
            '#details': 'details',
            '#singleUsed': 'singleUsed'
        },
        attributeValues: {
            ':singleUsed': singleUsed
        }
    });

    return true;
}

async function deleteStudent(studentId: string, license: string) {
    const student = await data.get<StudentConfigStorage>(getStudentPrimaryKey(studentId), 'studentId, license');
    if(student?.license != license) {
        throw new WebError('Access Denied', 403);
    }

    try {
        console.info('Getting pii data ', studentId);
        const piiObjects: DalKey[] = [].concat(
            ...await Promise.all([
                data.query({
                    keyExpression: 'pk = :pk',
                    attributeValues: {
                        ':pk': `S#${studentId}`
                    },
                    projectionExpression: 'pk, sk'
                }),
                data.query({
                    keyExpression: 'pk = :pk',
                    attributeValues: {
                        ':pk': `S#${studentId}#SCH`
                    },
                    projectionExpression: 'pk, sk'
                }),
                data.query({
                    keyExpression: 'pk = :pk',
                    attributeValues: {
                        ':pk': `S#${studentId}#BS`
                    },
                    projectionExpression: 'pk, sk'
                })
            ])
        );

        console.info('Deleting pii data ', studentId);
        console.debug('piiObjects', piiObjects);
        let promises: Promise<any>[] = [];
        for(let i = 0; i < piiObjects.length; i++) {
            promises.push(primary.delete(piiObjects[i]));

            if(promises.length > 20) {
                await Promise.all(promises);
                promises = [];
            }
        }
        await Promise.all(promises);
        promises = [];

        console.info('Getting config data ', studentId);
        const studentObjects: DalKey[] = await data.query({
            indexName: MttIndexes.student,
            keyExpression: 'studentId = :studentId',
            attributeValues: {
                ':studentId': studentId
            },
            projectionExpression: 'pk, sk'
        });

        console.info('Deleting config data ', studentId);
        for(let i = 0; i < studentObjects.length; i++) {
            promises.push(data.delete(studentObjects[i]));

            if(promises.length > 20) {
                await Promise.all(promises);
                promises = [];
            }
        }
        await Promise.all(promises);
    } catch (err) {
        console.error('Error deleting student ', studentId);
        console.error(err);
        throw err;
    }
}
