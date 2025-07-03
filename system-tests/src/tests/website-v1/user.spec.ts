import { LoggingLevel, constructLogger, webApi } from "../../lib";
import { config } from "../../config";

constructLogger(LoggingLevel.ERROR);

describe('user', () => {

    beforeEach(() => {
        
    });
    
    test('UpdateUser', async () => {
        await webApi.login();

        const user = await webApi.getUser();

        const modifiedName = 'modified';

        if(!user.details.firstName) {
            const parts = config.env.testing!.admin.name.split(' ');
            user.details.firstName = parts[0];
            user.details.lastName = parts.length > 1 ? parts[1] : parts[0];
            user.details.state = 'WA';
            user.details.zip = '99999';
        }

        await webApi.putUser({
            ...user.details,
            name: modifiedName,
            acceptTerms: true
        });

        const user2 = await webApi.getUser();
        expect(user2.details.name).toBe(modifiedName);

        await webApi.putUser({
            ...user.details,
            name: 'mytaptrack Parent',
            acceptTerms: true
        });
    }, 2 * 60 * 1000)
});
