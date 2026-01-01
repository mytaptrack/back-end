/**
 * DAL Integration Tests - Simplified after abstraction layer removal
 */

import { Dal, DalBaseClass } from './dal';

describe('DAL Integration Tests', () => {
    test('should use DynamoDB directly', () => {
        const dal = new Dal('primary');
        expect(dal.tableName).toBeDefined();
    });

    test('should create DalBaseClass instance', () => {
        const dalBase = new DalBaseClass();
        expect(dalBase).toBeDefined();
    });
});
