import { ActivityGroupDetails, BehaviorSettings, CalculatedServiceStat, LicenseDetails, LicenseStats, Measurement, MeasurementPeriod, ScheduleCategory, ScheduleItemType, ServiceReportStudentData, StudentDashboardSettings, StudentServiceGoals, StudentSummaryReport, StudentSummaryReportBehavior, StudentSummaryReportLegend, UserSummaryRestrictions, UserSummaryStatus } from "..";

export interface QLTag {
    tag: string | undefined;
    type: string | undefined;
}

export interface QLDeleteDetails {
    date: string | undefined;
    by: string | undefined;
}

export interface QLStudentDetails {
    firstName: string;
    lastName: string;
    nickname?: string;
    schoolId?: string;
    tags?: QLTag[];
}

export interface QLStudentSummary {
    studentId: string | undefined;
    details: QLStudentDetails | undefined;
    tracking: {
        service: boolean;
        behavior: boolean;
    }
    lastTracked: string | undefined;
    awaitingResponse: boolean;
    alertCount: number;
}

export interface QLLicenseSummary {
    fullYear?: boolean;
    flexible?: boolean;
    services: boolean;
    transferable: boolean;
    expiration?: string;
    schoolYear?: {
        start: string;
        end: string;
    }
}

export interface QLMilestone {
    date: string | undefined;
    description: string | undefined;
    title: string | undefined;
}

export interface QLTrackableTargetMeasurement {
    name: string | undefined;
    value: number | undefined;
}

export interface QLTrackableTarget {
    measurement: string | undefined;
    measurements: QLTrackableTargetMeasurement[] | undefined;
    progress: number | undefined;
    target: number | undefined;
    targetType: string | undefined;
}

export interface QLTrackable {
    daytime: boolean;
    id: string;
    name: string;
    desc?: string;
    isArchived: boolean;
    isDuration: boolean;
    targets: QLTrackableTarget[];
    trackAbc?: boolean;
    baseline?: boolean;
    managed?: boolean;
    requireResponse?: boolean;
    tags: QLTag[];
    graphs?: BehaviorSettings;
    intensity?: number;
}

export interface QLStudentDocument {
    id: string;
    name: string;
    timerange: {
        start: number;
    };
    size: number;
    uploadDate: number;
    complete: boolean;
}

export interface QLStudentNotification {
    epoch: number;
    behaviorId: string;
}

export interface QLStudent {
    studentId?: string;
    license?: string;
    licenseDetails?: QLLicenseSummary;
    schoolStudentId?: string;
    details: QLStudentDetails;
    lastTracked?: string;
    lastUpdateDate?: string;
    archived?: boolean;
    milestones?: QLMilestone[];
    abc?: QLAbcCollection;
    behaviors?: QLTrackable[];
    responses?: QLTrackable[];
    services?: QLService[];
    documents?: QLStudentDocument[];
    futureExclusions?: number[];
    dashboard: StudentDashboardSettings;
    studentDashboard?: StudentDashboardSettings;
    restrictions: UserSummaryRestrictions;
    features: QLLicenseFeatures;
    scheduleCategories?: ScheduleCategory[];
    notifications: QLStudentNotification[];
}

export interface QLStudentUpdateLicenseInput {
    fullYear: boolean | undefined;
    flexible: boolean | undefined;
    services: boolean;
    transferable: boolean;
}

export interface QLStudentUpdateInput {
    studentId?: string;
    license: string;
    licenseDetails?: QLStudentUpdateLicenseInput;
    schoolStudentId?: string;
    details?: QLStudentDetails;
    archived?: boolean;

    milestones?: QLMilestone[];
    abc?: QLAbcCollection;
    behaviors?: QLTrackable[];
    responses?: QLTrackable[];
    services?: QLServiceInput[];
    futureExclusions?: number[];
    dashboard?: StudentDashboardSettings;
    scheduleCategories?: ScheduleCategory[];
}

export interface QLNotificationDelete {
    studentId: string;
    events: {
        behaviorId: string;
        epoch: number;
    }[];
}

export enum QLMeasurementType {
    Event = "Event",
    Avg = "Avg",
    Sum = "Sum",
    Max = "Max",
    Min = "Min",
}

export interface QLServicesInput {
    services: QLServiceInput[];
}

export interface QLServiceInputDetailedTarget {
    date: number;
    target: number;
    groupId: number;
    type: ScheduleItemType;
}

export interface QLGlobalServicesReportSchedule {
    serviceId: string;
    date: number;
    studentId: string;
}

export interface QLReportDataSource {
    device: string;
    rater: string;
}

export interface QLReportDataAbc {
    a: string;
    c: string;
}

export interface QLReportDataProgress {
    progress?: number;
    measurements?: {
        name: string;
        value: number;
    }[];
}

export interface QLReportData {
    dateEpoc: number;
    behavior: string;
    duration?: number;
    reported?: boolean;
    score?: number;
    isManual?: boolean;
    notStopped?: boolean;
    source: QLReportDataSource;
    deleted?: QLDeleteDetails;
    abc?: QLReportDataAbc;
    intensity?: number;
}

export interface QLReportService {
    dateEpoc: number;
    service: string;
    duration?: number;
    reported?: boolean;
    isManual?: boolean;
    notStopped?: boolean;
    source: QLReportDataSource;
    deleted?: QLDeleteDetails;
    modifications: string[];
    serviceProgress: QLReportDataProgress;
}

export interface QLReportDataInput {
    dateEpoc: number;
    behavior?: string;
    service?: string;
    duration?: number;
    reported?: boolean;
    score?: number;
    isManual?: boolean;
    notStopped?: boolean;
    source?: QLReportDataSource;
    deleted?: QLDeleteDetails;
    abc?: QLReportDataAbc;
    intensity?: number;
    serviceProgress?: QLReportDataProgress;
    modifications?: string[];
    redoDurations?: boolean;
}

export interface QLReportDetailsSchedule {
    date: string;
    schedule: string;
}

export interface QLReportDetails {
    data: QLReportData[];
    services: QLReportService[];
    raters?: { rater: string; name: string}[];
    startMillis: number;
    endMillis: number;
    schedules?: QLReportDetailsSchedule[];
    excludeDays?:

 string[];
    includeDays?: string[];
    excludedIntervals?: string[];
}

export interface QLDataSourceSummary {
    id: string;
    name: string;
}

export interface QLTrackSummary {
    name: string;
    id: string;
}

export interface QLDataSources {
    team: QLDataSourceSummary[];
    apps: QLDataSourceSummary[];
    track2: QLDataSourceSummary[];
}

export interface QLSnapshotConfigMeasurement {
    name: string;
    order: number;
}

export interface QLSnapshotConfigMeasurementInput {
    name: string;
    order: number;
}

export interface QLSnapshotConfig {
    low: string;
    medium: string;
    high: string;
    measurements: QLSnapshotConfigMeasurement[];
}

export interface QLSnapshotConfigInput {
    low: string;
    medium: string;
    high: string;
    measurements: QLSnapshotConfigMeasurementInput[];
}

export interface QLLicenseDisplayTags {
    order: number;
    tagName: string;
}

export interface QLLicenseDisplayTagsInput {
    order: number;
    tagName: string;
}

export enum PersonalSubscriptionType {
    free = 'free',
    bronze = 'bronze',
    silver = 'silver',
    gold = 'gold'
}

export interface QLLicenseFeatures {
    snapshot: boolean;
    snapshotConfig?: QLSnapshotConfig;
    dashboard: boolean;
    browserTracking: boolean;
    download: boolean;
    duration: boolean;
    manage: boolean;
    supportChanges: boolean;
    schedule: boolean;
    devices: boolean;
    behaviorTargets: boolean;
    response: boolean;
    emailTextNotifications: boolean;
    manageStudentTemplates?: boolean;
    manageResponses?: boolean;
    abc: boolean;
    notifications: boolean;
    appGroups: boolean;
    documents: boolean;
    intensity?: number;
    intervalWBaseline: boolean;
    personal?: PersonalSubscriptionType;
    displayTags?: QLLicenseDisplayTags[];
}

export interface QLLicenseFeaturesInput {
    snapshot: boolean;
    snapshotConfig?: QLSnapshotConfigInput;
    dashboard: boolean;
    browserTracking: boolean;
    download: boolean;
    manage: boolean;
    supportChanges: boolean;
    schedule: boolean;
    devices: boolean;
    behaviorTargets: boolean;
    response: boolean;
    emailTextNotifications: boolean;
    manageStudentTemplates?: boolean;
    manageResponses?: boolean;
    abc: boolean;
    notifications: boolean;
    appGroups: boolean;
    documents: boolean;
    intervalWBaseline: boolean;
    personal?: PersonalSubscriptionType;
    displayTags?: QLLicenseDisplayTagsInput[];
}

export interface QLSubscriptionStudentConfigNameId {
    id: string;
    name: string;
}

export interface QLSubscriptionStudentConfig {
    studentId: string;
    name: string;
    behaviors: QLSubscriptionStudentConfigNameId[];
    responses: QLSubscriptionStudentConfigNameId[];
    notifyUntilResponse: boolean;
    users: QLSubscriptionStudentConfigNameId[]
    emails: string[];
    mobiles: string[];
    devices: QLSubscriptionStudentConfigNameId[];
    messages: {
        default?: string;
        email?: string;
        text?: string;
        app?: string;
    }
}

export interface QLSubscriptionStudentConfigInput {
    studentId: string;
    name: string;
    behaviorIds: string[];
    responseIds: string[];
    notifyUntilResponse: boolean;
    userIds: string[]
    emails: string[];
    mobiles: string[];
    deviceIds: string[];
    messages: {
        default?: string;
        email?: string;
        text?: string;
        app?: string;
    }
}

export interface QLLicenseTagSet {
    name: string;
    tags: string[];
}

export interface QLLicenseTagSetInput {
    name: string;
    tags: string[];
}

export interface QLAbcCollection {
    name: string;
    tags: string[];
    antecedents: string[];
    consequences: string[];
    overwrite?: boolean;
    remove?: boolean;
}

export interface QLAbcCollectionInput {
    name: string;
    tags: string[];
    antecedents: string[];
    consequences: string[];
    overwrite: boolean;
}

export interface QLLicenseDetails {
    license?: string;
    customer: string;
    singleCount: number;
    singleUsed: number;
    multiCount: number;
    appLimit?: number;
    serviceCount: number;
    serviceUsed: number;
    admins: string[];
    emailDomain?: string;
    expiration: string;
    mobileTemplates: QLLicenseAppTemplate[];
    studentTemplates: QLLicenseStudentTemplate[];
    features: QLLicenseFeatures;
    abcCollections: QLAbcCollection[];
    serviceSampleStudents: boolean;
    tags: QLLicenseTags;
}

export interface QLLicenseDetailsInput {
    license?: string;
    customer: string;
    singleCount: number;
    multiCount: number;
    appLimit?: number;
    admins: string[];
    emailDomain?: string;
    expiration: string;
    mobileTemplates: QLLicenseAppTemplateInput[];
    studentTemplates: QLLicenseStudentTemplateInput[];
    features?: QLLicenseFeaturesInput;
    abcCollections: QLAbcCollectionInput[];
    tags: QLLicenseTagsInput;
}

export interface QLLicenseTags {
    devices: QLLicenseTagSet[];
}

export interface QLLicenseTagsInput {
    devices: QLLicenseTagSetInput[];
}

export interface QLLicenseDetailsWithUsage {
    license?: string;
    customer: string;
    singleCount: number;
    singleUsed: number;
    multiCount: number;
    admins: string[];
    emailDomain: string;
    expiration: string;
    mobileTemplates: QLLicenseAppTemplate[];
    studentTemplates: QLLicenseStudentTemplate[];
    features: QLLicenseFeatures;
    abcCollections: QLAbcCollection[];
    tags: QLLicenseTags;
    usage: QLLicenseUsage[];
}

export interface QLLicenseUsage {
    month: string;
    trackedEvents: number;
    studentsTracked: number;
}

export interface QLLicenseDisplayTagsPutInput {
    license: string;
    displayTags: QLLicenseDisplayTagsInput[];
}

export interface QLReportDataSource {
    device: string;
    rater: string;
}

export interface QLReportDataAbc {
    a: string;
    c: string;
}

export interface QLReportDetailsSchedule {
    date: string;
    schedule: string;
}

export interface QLReportDetails {
    data: QLReportData[];
    startMillis: number;
    schedules?: QLReportDetailsSchedule[];
    excludeDays?: string[];
    includeDays?: string[];
    excludedIntervals?: string[];
}

export interface QLServicesInput {
    services: QLServiceInput[];
}

export interface QLServiceInput {
    id: string;
    name: string;
    desc?: string;
    durationRounding?: number;
    target: number;
    detailedTargets?: QLServiceInputDetailedTarget[];
    modifications: string[];
    goals: QLServiceGoal;
    startDate: number;
    endDate: number;
    isArchived: boolean;
}

export interface QLServiceGoal extends StudentServiceGoals {
}

export interface QLService {
    id: string;
    name: string;
    startDate: number;
    endDate: number;
    desc?: string;
    measurementUnit?: Measurement;
    durationRounding?: number;
    isDuration?: boolean;
    isArchived?: boolean;
    goals: QLServiceGoal;
    modifications: string[];
    target?: number;
    detailedTargets?: QLServiceDetailedTarget[];
    currentBalance?: number;
    lastUpdateDate?: number;
}

export interface QLServiceDetailedTarget {
    date: number;
    target: number;
    groupId: number;
    type: ScheduleItemType;
}

export interface QLServiceReportStudentData extends ServiceReportStudentData {
}

export interface QLServiceReportStudentSummary {
    studentId: string;
    studentName: string;
    services: QLServiceReportStudentData[]
}

export interface QLGlobalServiceReport {
    serviceId: string;
    serviceName: string;
    serviceMinutes?: number[];
}

export interface QLGlobalServicesReport {
    services?: QLGlobalServiceReport[];
    outOfComp?: QLServiceReportStudentSummary[];
    atRisk?: QLServiceReportStudentSummary[];
    students?: QLServiceReportStudentSummary[];
    schedule?: QLGlobalServicesReportSchedule[];
}

export interface QLTrackTemplateBehavior {
    name: string;
    desc?: string;
    track?: boolean;
    abc?: boolean;
    order: number;
}

export interface QLTrackTemplateBehaviorInput {
    name: string;
    desc?: string;
    track?: boolean;
    abc?: boolean;
    order: number;
}

export interface QLStudentTemplateBehavior {
    name: string;
    desc?: string;
    isDuration?: boolean;
    daytime?: boolean;
    baseline?: boolean;
    targets: QLStudentTemplateBehaviorTarget[];
}

export interface QLStudentTemplateBehaviorInput {
    name: string;
    desc?: string;
    isDuration?: boolean;
    daytime?: boolean;
    baseline?: boolean;
    targets: QLStudentTemplateBehaviorTargetInput[];
}

export interface QLStudentTemplateBehaviorTarget {
    targetType: string;
    target: number;
    progress?: number;
    measurements: QLStudentTemplateBehaviorMeasurement[];
    measurement?: QLMeasurementType;
}

export interface QLStudentTemplateBehaviorTargetInput {
    targetType: string;
    target: number;
    progress?: number;
    measurements: QLStudentTemplateBehaviorMeasurementInput[];
    measurement?: QLMeasurementType;
}

export interface QLStudentTemplateBehaviorMeasurement {
    name: string;
    value: number;
}

export interface QLStudentTemplateBehaviorMeasurementInput {
    name: string;
    value: number;
}

export interface QLLicenseStudentTemplate {
    name: string;
    desc?: string;
    behaviors: QLStudentTemplateBehavior[];
    responses: QLStudentTemplateBehavior[];
    appTemplates: QLLicenseAppTemplate[];
    tags: string[];
}

export interface QLLicenseStudentTemplateInput {
    name: string;
    desc?: string;
    behaviors: QLStudentTemplateBehaviorInput[];
    responses: QLStudentTemplateBehaviorInput[];
    appTemplates: QLLicenseAppTemplateInput[];
    tags: string[];
}

export interface QLLicenseAppTemplate {
    name: string;
    desc?: string;
    events: QLTrackTemplateBehavior[];
    tags: string[];
    parentTemplate?: string;
}

export interface QLLicenseAppTemplateInput {
    name: string;
    desc?: string;
    events: QLTrackTemplateBehaviorInput[];
    tags: string[];
    parentTemplate?: string;
}

export interface QLStudentNoteSource {
    id: string;
    name: string;
    type: 'track' | 'app' | 'user' | 'unknown';
}

export interface QLStudentNote {
    studentId: string;
    noteDate: number;
    noteId?: string;
    dateEpoc: number;
    date?: string;
    note: string;
    product: string;
    source?: QLStudentNoteSource;
    threadId?: string;
    remove?: boolean;
}

export interface QLStudentNoteRequest {
    studentId: string;
    startDate: string;
    endDate: string;
}

export interface QLSnapshotReport {
    studentId: string;
    lastModified: {
        userId: string;
        date: string;
    };
    message: string;
    date: string;
    type: 'Weekly' | 'Range';
    behaviors: StudentSummaryReportBehavior[];
    legend?: StudentSummaryReportLegend[];
    published: boolean;
}

export interface QLSnapshotReportsKey {
    date: string;
    type: 'Weekly' | 'Range';
}

export interface QLSnapshotReportRequest {
    studentId: string;
    date: string;
    reportType: 'Weekly' | 'Range';
}

export interface QLSnapshotReports {
    reports: QLSnapshotReportsKey[];
    latest?: QLSnapshotReport;
}

export interface QLLicenseStats extends LicenseStats {
    license: QLLicenseDetails;
}

export interface QLLicenseUpdate {
    license: string;
    admins?: string[];
    cancel?: boolean;
    fullCancel?: boolean;
}

export interface QLEmailSupport {
    url: string;
    problem: string;
}

export interface QLServerSettings {
    token: string;
}
