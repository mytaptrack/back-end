process.env.TeamTable = 'team';
process.env.StudentTable = 'student';
process.env.ReportTable = 'report';

let s3: any;
let dynamodb: any;
jest.mock('aws-sdk', () => {
    class S3Mock {
        listObjectResults: any[] = [];
        listObjects = jest.fn();
        deleteObject = jest.fn();
    
        reset() {
            this.listObjectResults = [{Key: 'key', Bucket: 'bucket'}];
            this.listObjects.mockReset();
            this.listObjects.mockImplementation(() => {
                return {
                    promise: async () => {
                        return {
                            Contents: this.listObjectResults
                        };
                    }
                }
            });
            this.deleteObject.mockReset();
            this.deleteObject.mockImplementation(() => {
                return {
                    promise: async () => {}
                };
            });
        }
    }
    class DynamoMock {
        queryResults: {[table: string]: any[]} = {};
        query = jest.fn();
        delete = jest.fn();
        reset() {
            this.queryResults = {
                team: [{userId: 'user', studentId: 'student', removed: 'Jan 1'}, {userId: 'user2', studentId: 'student', removed: 'Jan 1'}],
                report: [{studentBehavior: 'student', weekStart: '1/1/2020'}]
            };
            this.query.mockReset();
            this.query.mockImplementation((params: {TableName: string}) => {
                return {
                    promise: async () => {
                        return {
                            Items: this.queryResults[params.TableName]
                        };
                    }
                }
            });
            this.delete.mockReset();
            this.delete.mockImplementation(() => {
                return {
                    promise: async () => {}
                };
            });
        }
    }
    dynamodb = new DynamoMock();
    s3 = new S3Mock();
    return {
        S3: jest.fn().mockImplementation(() => s3),
        DynamoDB: {
            DocumentClient: jest.fn().mockImplementation(() => (dynamodb))
        },
        KMS: jest.fn().mockImplementation(() => {}),
        SES: jest.fn().mockImplementation(() => {}),
        SNS: jest.fn().mockImplementation(() => {}),
        SSM: jest.fn().mockImplementation(() => {}),
        SecretsManager: jest.fn().mockImplementation(() => {}),
    };
});
import { proc } from './studentRemoveFinal';

describe('studentRemoveFinal', () => {
    beforeEach(() => {
        dynamodb.reset();
        s3.reset();
    });
    test('All users marked removed', async () => {
        await proc({ studentId: '123'}, {} as any, () => {});
        expect(s3.listObjects).toBeCalledTimes(1);
        expect(s3.deleteObject).toBeCalledTimes(1);
        expect(dynamodb.query).toBeCalledTimes(2);
        expect(dynamodb.delete).toBeCalledTimes(4);
    });

    test('No users in list', async () => {
        dynamodb.queryResults['team'] = [];
        await proc({ studentId: '123'}, {} as any, () => {});
        expect(s3.listObjects).toBeCalledTimes(1);
        expect(s3.deleteObject).toBeCalledTimes(1);
        expect(dynamodb.query).toBeCalledTimes(2);
        expect(dynamodb.delete).toBeCalledTimes(2);
    });

    test('User removed does not exist', async () => {
        delete dynamodb.queryResults['team'][0].removed;
        await proc({ studentId: '123'}, {} as any, () => {});
        expect(s3.listObjects).toBeCalledTimes(0);
        expect(s3.deleteObject).toBeCalledTimes(0);
        expect(dynamodb.query).toBeCalledTimes(1);
        expect(dynamodb.delete).toBeCalledTimes(0);
    });
});