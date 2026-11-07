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
    await removePrefix(bucket, `students/plicense=${license}/pstudent=${studentId}/`);
    await removePrefix(bucket, `apps/plicense=${license}/pstudent=${studentId}/`);
    await removePrefix(bucket, `student/${studentId}/`);
}

async function removePrefix(bucket: string, prefix: string) {
    let marker: string | undefined;
    do {
        const objData: any = await s3.send(new ListObjectsCommand({
            Bucket: bucket,
            Prefix: prefix,
            Marker: marker
        }));

        // S3 omits Contents from an empty page, and NextMarker unless a delimiter is set.
        const contents: { Key: string }[] = objData.Contents ?? [];
        for(const item of contents) {
            await s3.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: item.Key
            }));
        }
        marker = objData.IsTruncated ? objData.NextMarker ?? contents[contents.length - 1]?.Key : undefined;
    } while(marker);
}
