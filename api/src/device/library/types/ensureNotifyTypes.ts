export interface EnsureNotifyParams {
    studentId: string;
    behaviorId: string;
    eventTime: string;
    isDuration: boolean;
    hasResponse: boolean;
    hasTimeout: boolean;
    dayMod2: number;
    weekMod2: number;
    skipTimeout?: boolean;
}
