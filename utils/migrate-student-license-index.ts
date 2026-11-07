#!/usr/bin/env node
/**
 * Moves student profile records to the one License index format GraphQL uses:
 *   lpk = L#<license>, lsk = S#<studentId>
 * Older records written by StudentDal used lpk = <license>#S, lsk = P#<studentId>, which the
 * GraphQL readers cannot see (and vice versa).
 *
 * Only student profiles are touched: pk = S#<id>, sk = P, in both the data and primary tables.
 * Dashboards (<license>#S / DA#...) and other record types keep their keys. Each write is
 * conditional on the old values, so the script is safe to re-run.
 *
 * Usage: npx ts-node migrate-student-license-index.ts <stage> [--apply]
 *   Without --apply it only reports what it would change.
 */
import { DynamoDBClient, ScanCommand, UpdateItemCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

const stage = process.argv[2];
const apply = process.argv.includes('--apply');
if (!stage || stage.startsWith('--')) {
    console.error('Usage: npx ts-node migrate-student-license-index.ts <stage> [--apply]');
    process.exit(1);
}

const client = new DynamoDBClient({});
const tables = [`mytaptrack-${stage}-data`, `mytaptrack-${stage}-primary`];

interface Legacy { pk: string; sk: string; lpk: string; lsk: string; }

async function findLegacy(table: string): Promise<Legacy[]> {
    const found: Legacy[] = [];
    let start: any;
    do {
        const page = await client.send(new ScanCommand({
            TableName: table,
            FilterExpression: 'begins_with(pk, :s) AND sk = :p AND begins_with(lsk, :lsk)',
            ExpressionAttributeValues: { ':s': { S: 'S#' }, ':p': { S: 'P' }, ':lsk': { S: 'P#' } },
            ProjectionExpression: 'pk, sk, lpk, lsk',
            ExclusiveStartKey: start
        }));
        for (const item of page.Items ?? []) {
            const lpk = item.lpk?.S ?? '';
            if (lpk.endsWith('#S')) {
                found.push({ pk: item.pk.S!, sk: item.sk.S!, lpk, lsk: item.lsk.S! });
            }
        }
        start = page.LastEvaluatedKey;
    } while (start);
    return found;
}

async function migrate(table: string, item: Legacy): Promise<'moved' | 'changed-since-scan'> {
    const license = item.lpk.slice(0, -'#S'.length);
    const studentId = item.pk.slice('S#'.length);
    try {
        await client.send(new UpdateItemCommand({
            TableName: table,
            Key: { pk: { S: item.pk }, sk: { S: item.sk } },
            UpdateExpression: 'SET lpk = :lpk, lsk = :lsk',
            ConditionExpression: 'lpk = :oldLpk AND lsk = :oldLsk',
            ExpressionAttributeValues: {
                ':lpk': { S: `L#${license}` }, ':lsk': { S: `S#${studentId}` },
                ':oldLpk': { S: item.lpk }, ':oldLsk': { S: item.lsk }
            }
        }));
        return 'moved';
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) return 'changed-since-scan';
        throw err;
    }
}

async function main() {
    console.log(`${apply ? 'APPLYING' : 'DRY RUN'} for stage ${stage}`);
    for (const table of tables) {
        const legacy = await findLegacy(table);
        const licenses = new Set(legacy.map(x => x.lpk));
        console.log(`${table}: ${legacy.length} student profiles in the old format across ${licenses.size} licenses`);
        if (!apply) continue;

        const results = { moved: 0, 'changed-since-scan': 0 };
        for (const item of legacy) {
            results[await migrate(table, item)]++;
        }
        console.log(`${table}: moved ${results.moved}, skipped ${results['changed-since-scan']} changed since the scan`);
    }
    if (!apply) console.log('Re-run with --apply to make these changes.');
}

main().catch(err => { console.error(err); process.exit(1); });
