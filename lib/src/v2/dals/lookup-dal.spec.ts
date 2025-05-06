process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';

import { LookupDal } from "./index";

const license = '202012316a147c1978f645abb14c6148015a7a19';
describe('lookup-dal', () => {
    test('getTagsFromShortIds', async () => {
        const tags: string[] = ["wbb7kRJwfgKc8yRYp6uRuz","dirMPHp7MYj6KVGZ1Jnrtu","1dnQNzQaZoVEYwUPzYAVPq","o6Jizq9H7aWdqfGowpRKZ5","1ohX4ZvNaGHH3qMC6jsz6s","nkkgjossZTKggESxpjBoU4","rMNe9aVwJokCTzyz6pKMqd"];
        const results = await LookupDal.getTagsFromShortIds(license, tags)
        expect(results.length).toBe(7);
        console.log(results);
    });
});
