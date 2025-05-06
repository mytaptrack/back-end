import { StudentConfigStorage } from "@mytaptrack/lib";
import { Dal } from "@mytaptrack/lib/dist/v2/dals/dal";
import { webApi } from "./lib/api-web";
import { User } from "@mytaptrack/types";

const primary = new Dal('primary');
const data = new Dal('data');

let user: User;

export async function cleanUp(studentId: string) {
    await Promise.all([
        data.delete({ pk: `S#${studentId}`, sk: 'P'}),
        primary.delete({ pk: `S#${studentId}`, sk: 'P'}),
        data.delete({ pk: `U#${user.userId}`, sk: `S#${studentId}#S`})
    ]);
}

async function fullClean() {
    let token: any;
    await webApi.login();
    user = await webApi.getUser();
    do {
        console.log('Querying for more items');
        const studentConfigs = await primary.scan<StudentConfigStorage[]>({
            filterExpression: 'begins_with(pk, :pk) and sk = :sk and begins_with(firstName, :firstName)',
            attributeValues: {
                ':pk': 'S#',
                ':sk': 'P',
                ':firstName': 'System Test'
            },
            token
        });
        token = studentConfigs.token;
        console.log('Items found', studentConfigs.items?.length)

        await Promise.all(studentConfigs.items!.map(async item => {
            await cleanUp(item.studentId);
        }));
        console.log('Items cleaned');
    } while(token);
}

fullClean();