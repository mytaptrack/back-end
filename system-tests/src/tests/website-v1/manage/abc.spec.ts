import { LicenseStorage } from "@mytaptrack/lib";
import { data, license } from "../../../config";
import { LoggingLevel, constructLogger, login, webApi } from "../../../lib";

constructLogger(LoggingLevel.ERROR);

describe('manage-abc', () => {
    beforeAll(async () => {
        await webApi.login();
    });

    test('abcput', async () => {
        const licenseData = await data.get<LicenseStorage>({ pk: 'L', sk: `P#${license}`});
        licenseData.details.abcCollections = [];
        await data.put(licenseData);

        const antecedents = ['a1', 'a2', 'a3'];
        const consequences = ['c1', 'c2', 'c3'];
        await webApi.manageAbcPut([ { antecedents, consequences, name: 'System Test Abc', tags: []}]);

        console.info('Getting license');
        const licenseResponse = await webApi.manageLicenseGet(license);

        expect(licenseResponse.abcCollections?.length).toBe(1);
        expect(licenseResponse.abcCollections![0].antecedents).toEqual(antecedents);
        expect(licenseResponse.abcCollections![0].consequences).toEqual(consequences);
    }, 2 * 60 * 1000);
});
