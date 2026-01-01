import { LicenseStorage } from "@mytaptrack/lib";
import { data, license } from "../../../config";
import { Logger, LoggingLevel, qlApi } from "../../../lib";

const logger = new Logger('QLManageAbc', LoggingLevel.warn);

describe('QLManageAbc', () => {
    beforeAll(async () => {
        await qlApi.login();
    });

    test('QLAbcPut', async () => {
        const licenseData = await data.get<LicenseStorage>({ pk: 'L', sk: `P#${license}`});
        licenseData.details.abcCollections = [];
        await data.put(licenseData);

        const antecedents = ['a1', 'a2', 'a3'];
        const consequences = ['c1', 'c2', 'c3'];
        await qlApi.changeLicense({
            license,
            abcCollections: [{
                antecedents,
                consequences,
                name: 'System Test Abc', 
                tags: [],
                overwrite: true
            }]
        });

        logger.info('Getting license');
        const licenseResponse = await qlApi.getLicenses([license]);

        expect((licenseResponse as any)?.length).toBe(1);
        expect((licenseResponse as any)![0].abcCollections?.length).toBe(1);
        expect((licenseResponse as any)![0].abcCollections![0].antecedents).toEqual(antecedents);
        expect((licenseResponse as any)![0].abcCollections![0].consequences).toEqual(consequences);
    }, 2 * 60 * 1000);
});
