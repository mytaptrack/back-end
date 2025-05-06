export interface Customer {
    school: string;
    district: string;
    state: string;
}

export interface Placement extends Customer {
    dsn: string;
}
export interface CustomerMonthlyReport extends Customer {
    monthStart: string;
    composit: string;
    count: number;
    days: {
        [key: string]: {
            students: { [key: string]: boolean; };
            devices: { [key: string]: boolean; };
        }
    };
}

export interface TrackingMessage {
    serialNumber: string;
    studentId: string;
    date: string;
}