import { LoggingLevel, Logger, qlApi } from "../../lib";
import { config } from "../../config";

const logger = new Logger('QLUser', LoggingLevel.warn);

describe('QLUser', () => {
    beforeEach(() => {
        
    });
    
    test('QLUpdateUser', async () => {
        await qlApi.login();

        const user = await qlApi.getUser();

        const modifiedName = 'modified';

        if(!user.firstName) {
            const parts = config.env.testing!.admin.name.split(' ');
            user.firstName = parts[0];
            user.lastName = parts.length > 1 ? parts[1] : parts[0];
            user.state = 'WA';
            user.zip = '99999';
        }

        await qlApi.updateUser({
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName!,
            name: modifiedName,
            email: user.email!,
            state: user.state,
            zip: user.zip,
            students: []
        });

        const user2 = await qlApi.getUser();
        expect(user2.name).toBe(modifiedName);

        await qlApi.updateUser({
            id: user.id!,
            firstName: user.firstName,
            lastName: user.lastName!,
            name: 'mytaptrack Parent',
            email: user.email!,
            state: user.state,
            zip: user.zip,
            students: []
        });
    }, 2 * 60 * 1000)
});
