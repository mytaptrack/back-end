import { QLAbcCollection, QLService, QLServiceGoal, QLStudent, QLTag, QLTrackable, UserSummaryRestrictions } from '..';

export interface GraphQLAppBehaviorItem {
    id: string;
    abc?: boolean;
    intensity?: boolean;
    maxIntensity?: number;
    order: number;
    name: string;
}

export interface QLAppToken {
    deviceId: string;
    token: string;
}

export interface GraphQLAppBehaviorItemEx extends GraphQLAppBehaviorItem {
    isDuration: boolean;
    notStopped?: boolean;
    lastStart?: number;
}

export interface GraphQLAppBehaviorItemInput {
    id: string;
    name?: string;
    abc?: boolean;
    intensity?: boolean;
    maxIntensity?: number;
    order: number;
}

export interface GraphQLAppServiceItem {
    id: string;
    order: number;
    name: string;
    trackedItems: string[];
    percentage: boolean;
    modifications: string[];
}

export interface GraphQLAppServiceItemInput {
    id: string;
    order: number;
    name: string;
}

export interface QLAppSummary {
    deviceId: string;
    name: string;
    tags: string[];
    groups?: string[];
    studentId?: string;
    studentName?: string;
    behaviors?: GraphQLAppBehaviorItem[];
    responses?: GraphQLAppBehaviorItem[];
    services?: GraphQLAppServiceItem[];
    textAlerts?: boolean;
}

export interface GraphQLAppStudent {
    studentId: string;
    studentName: string;
    license?: string;
    groups: string[];
    behaviors: GraphQLAppBehaviorItem[];
    responses: GraphQLAppBehaviorItem[];
    services: GraphQLAppServiceItem[];
}

export interface GraphQLAppStudentEx extends  GraphQLAppStudent {
    abc: QLAbcCollection;
    behaviors: GraphQLAppBehaviorItemEx[];
    responses: GraphQLAppBehaviorItemEx[];
}

export interface GraphQLAppStudentInput {
    studentId: string;
    studentName: string;
    groups: string[];
    behaviors: GraphQLAppBehaviorItemInput[];
    responses: GraphQLAppBehaviorItemInput[];
    services: GraphQLAppServiceItemInput[];
    delete?: boolean;
}

export interface QLAppStudentSummaryTrackable {
    id: string;
    name: string;
    baseline?: boolean;
    isDuration?: boolean;
    trackAbc?: boolean;
}

export interface QLAppStudentSummary {
    studentId: string;
    nickname: string;
    abcAvailable?: boolean;
    restrictions: UserSummaryRestrictions;
    behaviors: QLAppStudentSummaryTrackable[];
    responses: QLAppStudentSummaryTrackable[];
    services: QLAppStudentSummaryTrackable[];
}

export interface QLApp {
    deviceId?: string;
    license: string;
    name: string;
    textAlerts: boolean;
    timezone: string;
    studentConfigs: GraphQLAppStudent[];
    qrExpiration?: number;
    tags?: QLTag[];
    students: QLAppStudentSummary[];
}

export interface QLAppDeviceConfiguration {
    deviceId: string;
    license: string;
    textAlerts?: boolean;
    name: string;
    identity?: string;
    timezone: string;
    studentConfigs: GraphQLAppStudentEx[];
}

export interface GraphQLAppInput {
    deviceId?: string;
    license: string;
    name: string;
    textAlerts: boolean;
    timezone: string;
    studentConfigs: GraphQLAppStudentInput[];
    qrExpiration?: number;
    tags?: QLTag[];
    deleted?: boolean;
    reassign?: boolean;
}

export interface GraphQLAppOutput {
    deviceId: string;
}

export interface GraphQLIoTClickerBehaviorItem {
    behaviorId: string;
    presses: number;
}

export interface GraphQLIoTClickerSwitchCommand {
    term: string;
    studentId: string;
}

export interface GraphQLIoTClicker {
    dsn: string;
    deviceName: string;
    validated: boolean;
    events: GraphQLIoTClickerBehaviorItem[];
    termSetup?: boolean;
    commands: GraphQLIoTClickerSwitchCommand[];
    timezone: string;
}

export interface GraphQLDeviceCollection {
    apps: QLApp[];
    clickers: GraphQLIoTClicker[];
}
