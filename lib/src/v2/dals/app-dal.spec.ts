
process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';
process.env.TokenEncryptKey = '/test/app/tokenKey';
process.env.debug = 'true';

import { AppDal } from './app-dal';

const studentId = '174d21ba-e009-40a9-8d9b-9fa205f7139c';

describe('AppDal', () => {
    test('getAppsForStudent', async () => {
        const apps = await AppDal.getAppsForStudent(studentId);
        expect(apps).toBeDefined();
        expect(apps.length).toBe(4);
    }, 30000);

    test('getAppsForStudent2', async () => {
        const apps = await AppDal.getAppsForStudent('625793de-d8e0-4636-ab8b-9258a6803115');
        expect(apps).toBeDefined();
        console.log(apps.map(x => x.details.deviceName));
    }, 30000);

    test('getAppsForLicense', async () => {
        const apps = await AppDal.getAppsForLicense('202012316a147c1978f645abb14c6148015a7a19');
        expect(apps).toBeDefined();
        expect(apps.length).toBeGreaterThan(6);
        console.log(apps.map(x => x.device.name));
    }, 30000);

    test('resolveTokens', async () => {
        const apps = await AppDal.resolveTokens(["U2FsdGVkX1/QYrmGMKyxZkAfWRIvp7gbTqXq8SDcioSDYpvKw6SaUbcW9sY8VNQQvv5YL364z6ZhBGFyh0sEaqW3RhbhJEOiiJhKTwdCIcK2qcXzmJl7n9sSPHl+oAtP"], '64742540-D752-4423-A02B-2229F0AC2274', []);
        expect(apps).toBeDefined();
        expect(apps.length).toBe(1);
    });

    test('resolveTokens2', async () => {
        const data = {"device":{"id":"380B1711-4BE9-4037-9363-78C2D0529842","name":"iPhone 13"},"tokens":["U2FsdGVkX19sgUH9TM/nnaU4W95D7x0eI3rraSI8wP/1hlyDLCowP7ow+5nFQlx/qHZgKtQPeR+SHI+e9zP4VLEtoM937OYwqeYTnUlbuLuEerMuIKBudD5fhDn9oheX"],"notifications":{"token":"","os":""}};
        const apps = await AppDal.resolveTokens(data.tokens, data.device.id, []);
        expect(apps.length).toBe(1);
    }, 30000);

    test('deleteTokens', async () => {
        await AppDal.deleteTokens(['U2FsdGVkX18sR3L9OuhWfEebBgWMJh6gsQarZ8OsfJUYEM8LvxQkT9CeMrfsmIvjX0zfu9a+jCnHj3n3VK1Z+zDzStTWK6+cYfOEbhdnv6kx1OOm49gCX+SvfKBWjpaO'], '195910A0-5048-4044-AD66-7ADD3FE1248C');
    }, 30000);

    test('convertDeviceId-New', async () => {
        await AppDal.convertDeviceId('202012316a147c1978f645abb14c6148015a7a19', 'MLC-2b6e3599-7ac8-4e36-be43-97554019b064', '84d99921fccc3ac6');
    })
});
