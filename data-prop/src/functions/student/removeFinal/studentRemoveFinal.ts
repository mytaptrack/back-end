import { RemoveStudentInput } from '../../../library';
import { DeleteObjectCommand, ListObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { WebUtils, v2 } from '@mytaptrack/lib';

const s3 = new S3Client({});

export const proc = WebUtils.stepLambdaWrapper(handler);

export async function handler(event: RemoveStudentInput) {
    WebUtils.logObjectDetails(event);

    const team = await v2.TeamDal.getTeam(event.studentId);
    if(team.length !== 0) {
        console.log(`Student ${event.studentId} still has team members`);
        return;
    }
    const student = await v2.StudentDal.getStudent(event.studentId);

    await v2.StudentDal.removeStudentAll(event.studentId);
    
    await removeS3(student.license!, event.studentId, process.env.dataBucket!);

    console.log('Complete');
}

async function removeS3(license: string, studentId: string, bucket: string) {
    let token;
    do {
        const objData: any = await s3.send(new ListObjectsCommand({
            Bucket: bucket,
            Prefix: `/students/plicense=${license}/pstudent=${studentId}/`,
            Marker: token
        }));

        token = objData.NextMarker;

        for(const item of objData.Contents) {
            await s3.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: item.Key
            }));
        }
    } while(token);

    token = undefined;
    do {
        const objData: any = await s3.send(new ListObjectsCommand({
            Bucket: bucket,
            Prefix: `/student/${studentId}/`,
            Marker: token
        }));

        token = objData.NextMarker;

        for(const item of objData.Contents) {
            await s3.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: item.Key
            }));
        }
    } while(token);
}
