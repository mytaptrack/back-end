import { ReportDetails, ReportData } from '@mytaptrack/types';

const char0 = '0'.charCodeAt(0);
const char9 = '9'.charCodeAt(0);
const charA = 'a'.charCodeAt(0);
const charDash = '-'.charCodeAt(0);

function pad(num: number, size: number): string {
    const sign = Math.sign(num) === -1 ? '-' : '';
    return sign + new Array(size).concat([Math.abs(num)]).join('0').slice(-size);
}

export interface ProcessedRecord {
    [key: string]: string;
}

export interface AiReportDetails {
    weekStart: string;
    studentId: string;
    data: ReportData[];
    type: string;
}

class AiUtilsClass {
    getDateFromWeekStart(weekStart: string) {
        const parts = weekStart.split('/');
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }

    processRecord(report: AiReportDetails): ProcessedRecord {
        const retval = {} as ProcessedRecord;
        const date = this.getDateFromWeekStart(report.weekStart);
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);

        const behaviors: string[] = [];
        const behaviorItems: {[key: string]: ReportData[]} = {};
        report.data.forEach(item => {
            if (!behaviors.find(x => x === item.behavior)) {
                if (item.behavior) {
                    behaviors.push(item.behavior);
                    behaviorItems[item.behavior] = report.data.filter(x => x.behavior === item.behavior);
                }
            }
        });
        const parts: {[key: string]: string[]} = {};
        const fiveMinutes = (5 * 60 * 1000);
        const keyPrefix = `student/${report.studentId}/${date.getFullYear()}-${pad(date.getMonth(), 2)}-${pad(date.getDate(), 2)}`;
        for (const current = new Date(date.getTime());
             current.getTime() < end.getTime();
             current.setTime(current.getTime() + fiveMinutes)) {
            behaviors.forEach(behavior => {
                const key = `${keyPrefix}/${behavior}.csv`;
                if (!parts[key]) {
                    parts[key] = [];
                }
                const filtered = behaviorItems[behavior].filter(item => {
                    const itemDate = new Date(item.dateEpoc);
                    if (itemDate.getTime() >= current.getTime() && itemDate.getTime() < current.getTime() + fiveMinutes) {
                        return item;
                    }
                });
                parts[key].push(`${Math.abs(this.getGuidAsNumber(behavior))},${filtered.length}`);
            });
        }

        Object.keys(parts).forEach(key => {
            retval[key] = 'behavior,count\n' + parts[key].join('\n');
        });

        return retval;
    }

    getGuidAsNumber(input: string) {
        const value = hashCode(input);
        return value;
    }

    getModelPath(studentId: string, date: Date = null) {
        let retval = `/student/${studentId}/`;
        if (date) {
            let weekStart = date;
            if (!weekStart) {
                weekStart = new Date();
            }

            weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - weekStart.getDay());
            retval += weekStart.getTime() + '/';
        }

        return retval;
    }

    getDataFromKey(path: string) {
        const parts = path.split('/');
        if (parts[0] !== 'student' || parts.length < 3) {
            return null;
        }

        return {
            studentId: parts[1],
            date: new Date(parseInt(parts[2], 10))
        };
    }
}

export const AiUtils = new AiUtilsClass();

function hashCode(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }

    return h;
}
