import { WebUtils, v2, moment, ProcessButtonRequest } from '@mytaptrack/lib';
import { Context, EventBridgeEvent } from 'aws-lambda';
import { TimestreamWriteClient, WriteRecordsCommand, _Record } from '@aws-sdk/client-timestream-write';
import { TimestreamQueryClient, QueryCommand, Row } from '@aws-sdk/client-timestream-query';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';

const timestream = new TimestreamWriteClient();
const timestreamQuery = new TimestreamQueryClient();
const data = new Dal('data');

const DATA_VERSION = '5';

export const processRequest = WebUtils.lambdaWrapper(handler);

export async function handler(event: EventBridgeEvent<'track-event', v2.ProcessButtonRequestExtended>, context: Context) {
    WebUtils.logObjectDetails(event);

    const studentCache = event['studentCache']? event['studentCache'] : [];

    try {
        console.log('Getting data for timestream');
        const records = await v2.TimestreamDal.constructRecords([event.detail]);
        
        console.log('Records retrieved', records.length);
        if(records && records.length > 0) {
            const batchSize = 1;
            for(let i = 0; i < records.length; i += batchSize) {
                const endPos = i + batchSize < records.length? i + batchSize : undefined;
                const batch = records.slice(i, endPos);
                console.log('Writing batch', i, endPos);
                WebUtils.logObjectDetails(batch);
                await v2.TimestreamDal.writeRecords(batch);
            }
        } else {
            console.log('No records');
        }
    } catch(err) {
        console.log('Error processing queue', err);
        throw err;
    }
}

export const buildHandler = WebUtils.lambdaWrapper(build);
export async function build(event) {
    let token = event.token;
    do {
        console.log('Querying for data');
        const results = await data.scan({
            filterExpression: 'begins_with(pk, :pkPrefix) and contains(pk, :pkSuffix)',
            attributeValues: {
                ':pkPrefix': 'S#',
                ':pkSuffix': '#R',
            },
            token
        });

        token = results.token;

        console.log('Processing data');
        for(let item of (results.items as v2.DataStorage[])) {
            console.log('Getting student id');
            const studentId = item.pk.split('#')[1];
            console.log('Student', studentId);
            if(!item.pk.match(/S\#.*\#R/) || !studentId) {
                console.log('Not the right kind of record');
                continue;
            }

            if(!item.data) {
                console.log('No Data to consume');
                continue;
            }

            const epocToFilter = event.epoc ?? 0;
            console.log('Constructing messages');
            const messages = item.data.filter(data => data.dateEpoc > epocToFilter).map(data => ({
                    studentId,
                    behaviorId: data.behavior,
                    data,
                    sourceDevice: data.source?.device,
                    sourceRater: data.source?.rater,
                    attributes: {},
                    remainingLife: undefined,
                    serialNumber: data.source?.rater.startsWith('M2')? data.source?.rater : undefined,
                    clickType: data.isManual? v2.IoTClickType.manual : v2.IoTClickType.clickCount,
                    dateEpoc: data.dateEpoc,
                    isDuration: false,
                    remove: data.deleted? true : undefined
                } as v2.ProcessButtonRequestExtended));

            console.log('Processing data');
            const records = await v2.TimestreamDal.constructRecords(messages);
                
            console.log('Records retrieved', records.length);
            if(records && records.length > 0) {
                const batchSize = 10;
                for(let i = 0; i < records.length; i += batchSize) {
                    const endPos = i + batchSize < records.length? i + batchSize : undefined;
                    const batch = records.slice(i, endPos);
                    console.log('Writing batch', i, endPos);
                    WebUtils.logObjectDetails(batch);
                    await v2.TimestreamDal.writeRecords(batch);
                    console.log('Last epoc', batch[batch.length - 1].Time);
                }
            } else {
                console.log('No records');
            }
        }
        console.log('Processed to', JSON.stringify(token));
    } while (token);
    console.log('Processing complete');
}

function column(row: Row, name: string, offsets: {[key: string]: number}, type: string) {
    if(offsets[name] == undefined) {
        return;
    }
    if(row.Data[offsets[name]].NullValue) {
        return;
    }
    return { Name: name, Value: row.Data[offsets[name]].ScalarValue, DimensionValueType: type }
}

export const cleanHander = WebUtils.lambdaWrapper(cleanTimestream);
export async function cleanTimestream() {
    const eventsTable = `"${process.env.timestreamDatabase}"."data"`;
    const QueryString = `
select license, behaviorId, studentId, sourceDevice, sourceRater, licenseType, tags, version, a, c, measure_name, time from ${eventsTable}
where measure_value::bigint = 1`.slice(1);
    console.log('Query', QueryString);

    let token;
    do {
        const queryResults = await timestreamQuery.send(new QueryCommand({
            QueryString: QueryString,
            NextToken: token
        }));
    
        token = queryResults.NextToken;
        
        console.log('Mapping records');

        const offsets: {[key: string]: number} = {};
        queryResults.ColumnInfo.forEach((column, index) => {
            offsets[column.Name] = index;
        });
        const records = queryResults.Rows.map(x => {
            try {
                return {
                    Dimensions: [
                        column(x, 'license', offsets, 'VARCHAR'),
                        column(x, 'behaviorId', offsets, 'VARCHAR'),
                        column(x, 'studentId', offsets, 'VARCHAR'),
                        column(x, 'sourceDevice', offsets, 'VARCHAR'),
                        column(x, 'sourceRater', offsets, 'VARCHAR'),
                        column(x, 'licenseType', offsets, 'VARCHAR'),
                        column(x, 'tags', offsets, 'VARCHAR'),
                        column(x, 'version', offsets, 'VARCHAR'),
                        column(x, 'a', offsets, 'VARCHAR'),
                        column(x, 'c', offsets, 'VARCHAR'),
                    ].filter(item => item? true : false),
                    MeasureName: x.Data[offsets['measure_name']].ScalarValue,
                    MeasureValue: '0',
                    MeasureValueType: 'BIGINT',
                    Time: new Date(x.Data[offsets['time']].ScalarValue).getTime().toString(),
                    TimeUnit: 'MILLISECONDS',
                    Version: new Date().getTime()
                } as _Record;
            } catch(err) {
                console.log('Error mapping record', err);
                console.log('Columns', queryResults.ColumnInfo);
                console.log('Record', JSON.stringify(x, undefined, 2));
                throw err;
            }
        });

        console.log('Putting updates');
        const batchSize = 10;
        for(let i = 0; i < records.length; i += batchSize) {
            const endPos = i + batchSize < records.length? i + batchSize : undefined;
            const batch = records.slice(i, endPos);
            WebUtils.logObjectDetails(batch);
            const request = timestream.send(new WriteRecordsCommand({
                DatabaseName: process.env.timestreamDatabase,
                TableName: 'data',
                Records: batch
            }));
            try {
                await request;
            } catch (err) {
                console.log(JSON.stringify(batch));
                console.log('Error', i, JSON.stringify(err));
                if (err.Code === 'RejectedRecordsException') {
                    const responsePayload = JSON.parse(request['response'].httpResponse.body.toString());
                    console.log("RejectedRecords: ", responsePayload, JSON.stringify(records));
                }
                throw err;
            }
        }
    } while (token);
}
