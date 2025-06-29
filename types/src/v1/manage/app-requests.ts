import { StudentTemplateBehavior, TrackTemplateBehavior } from '..';

export interface ManageAppRenamePostRequest {
    deviceId: string;
    fromName: string;
    toName: string;
    tags: string[];
}

export interface ManageStudentTemplatePutRequest {
    tag: string;
    behaviors: StudentTemplateBehavior[];
}

export interface ManageDeviceTemplatePutRequest {
    tag: string;
    behaviors: TrackTemplateBehavior[];
}
