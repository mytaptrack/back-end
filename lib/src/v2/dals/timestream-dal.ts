// Timestream functionality has been removed
// This file is kept for compatibility but all methods are disabled

export interface ProcessButtonRequestExtended {
    attributes: {
        [key: string]: string;
    };
}

class TimestreamDalClass {
    async deleteEvent(record: ProcessButtonRequestExtended) {
        throw new Error('Timestream feature is not accessible');
    }

    async constructRecords(records: ProcessButtonRequestExtended[], studentCache: any[] = []): Promise<any[]> {
        throw new Error('Timestream feature is not accessible');
    }

    async writeRecords(batch: any[]) {
        throw new Error('Timestream feature is not accessible');
    }

    async processRecord(request: ProcessButtonRequestExtended, studentCache: any[]): Promise<any> {
        throw new Error('Timestream feature is not accessible');
    }
}

export const TimestreamDal = new TimestreamDalClass();
