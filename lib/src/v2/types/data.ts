import { typesV2 } from '@mytaptrack/types';

export interface DataType {
    pk: string;
    sk: string;
    pksk: string;
    version: number;
}

export interface DataTypeLicense extends DataType {
    license: string;
}

export interface DataStorage extends typesV2.ReportDetails, DataTypeLicense {
}
