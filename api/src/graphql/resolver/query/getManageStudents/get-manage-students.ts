import { MttAppSyncContext, StudentConfigStorage, StudentPiiStorage, StudentStorageModel, WebError, WebUtils } from '@mytaptrack/lib';
import { Dal, MttIndexes } from '@mytaptrack/lib/dist/v2/dals/dal';
import { Student } from '@mytaptrack/types';

export const handler = WebUtils.graphQLWrapper(handleEvent);

const data = new Dal('data');
const primary = new Dal('primary');

export async function handleEvent(context: MttAppSyncContext<{ license: string }, never, never, {}>) {
    const { license } = context.arguments;
    const licenses = context.stash.licenses;

    if (!licenses || licenses.length == 0 || !licenses.includes(license)) {
        throw new WebError('Access Denied');
    }

    console.log('Getting students for license:', license);

    try {
        // Query for all students in the license
        const students = await data.query<StudentConfigStorage>({
            indexName: MttIndexes.license,
            keyExpression: 'lpk = :licensePk and begins_with(lsk, :studentPrefix)',
            attributeValues: {
                ':licensePk': `L#${license}`,
                ':studentPrefix': 'S#'
            }
        });

        console.log(`Found ${students.length} students for license ${license}`);

        // Filter and format the results
        const formattedStudents: Student[] = await Promise.all(students
            .map(async student => {
                const pii = await primary.get<StudentPiiStorage>({ pk: student.pk, sk: student.sk }, 'firstName, lastName, nickname, pk, sk');
                if(!pii) {
                    return;
                }
                return {
                    studentId: student.studentId,
                    license: license,
                    details: {
                        firstName: pii.firstName,
                        lastName: pii.lastName, 
                        nickname: pii.nickname
                    }
                } as Student
            }).filter(student => student));

        return {
            students: formattedStudents
        };

    } catch (error) {
        console.error('Error getting students for license:', error);
        throw new WebError('Failed to get students for license');
    }
}
