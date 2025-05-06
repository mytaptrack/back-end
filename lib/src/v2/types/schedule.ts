import { typesV2 } from "@mytaptrack/types";
import { DataTypeLicense } from ".";

export interface ActivityGroupEx extends typesV2.ActivityGroupDetails {
    time: number;
}

export interface ScheduleStorage extends DataTypeLicense {
    studentId: string;
    tsk: string;
    schedules: ActivityGroupEx[];
    latest: ActivityGroupEx;
    deleted?: boolean;
}

export interface SchedulePiiStorage extends DataTypeLicense {
    studentId: string;
    tsk: string;
    names: { name: string, id: string }[];
}