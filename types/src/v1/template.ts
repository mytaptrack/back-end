import { MeasurementType } from '.';

export interface LicenseTemplate<T> {
    type: 'app' | 'device' | 'student';
    tag: string;
    desc: string;
    behaviors: T[];
    studentTags?: string[];
}

export interface TrackTemplateBehavior {
    name: string;
    desc: string;
    track?: boolean;
    alert?: boolean;
    abc?: boolean;
    order: number;
}

export interface StudentTemplateBehavior {
    name: string;
    desc: string;
    isDuration?: boolean;
    order: number;
    requireResponse?: boolean;
    targets?: {
        [targetType: string]: {
            target: number;
            progress?: number;
            measurement: MeasurementType;
        };
    };
}
