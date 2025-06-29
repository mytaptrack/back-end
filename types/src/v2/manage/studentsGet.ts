import { IoTDevice, UserSummary, StudentBehavior, Student } from '..';

export interface ManageStudent {
    studentId: string;
    firstName: string;
    lastName: string;
    details: {
        behaviors: StudentBehavior[];
        responses: StudentBehavior[];
        users?: UserSummary[];
        devices?: IoTDevice[];
    };
    licenseDetails: {
        fullYear: boolean;
        expiration: string;
    };
    tags: string[];
}

export interface ManageStatRow {
    date: string;
    count: number;
}

export interface ManageStudentGetResponse {
    students: Student[];
}
