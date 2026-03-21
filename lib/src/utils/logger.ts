import { moment } from './moment';

export enum LoggingLevel {
    debug = 0,
    info = 1,
    warn = 2,
    error = 3,
    protected = 4,
    none = 5
}

export class MttLogger {
    protected component: string;
    protected level: LoggingLevel;
    
    constructor(component: string, level: LoggingLevel) {
        this.component = component;
        this.level = level;
    }

    static getLogger(component: string, level: LoggingLevel) {
        return new MttLogger(component, level);
    }

    debug(...args: any[]) {
        if(this.level > LoggingLevel.debug) {
            return;
        }

        this.writeToLog(args, 'DEBUG');
    }

    info(...args: any[]) {
        if(this.level > LoggingLevel.info) {
            return;
        }

        this.writeToLog(args, 'INFO');
    }

    warn(...args: any[]) {
        if(this.level > LoggingLevel.warn) {
            return;
        }

        this.writeToLog(args, 'WARN');
    }

    error(...args: any[]) {
        if(this.level > LoggingLevel.error) {
            return;
        }

        this.writeToLog(args, 'ERROR');
    }

    log(...args: any[]) {
        this.writeToLog(args, 'LOG');
    }

    private writeToLog(args: any[], type: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'LOG') {
        for(let i = 0; i < args.length; i++) {
            if(typeof args[i] == 'object') {
                try {
                    args[i] = JSON.stringify(args[i], undefined, '  ');
                } catch (err) {

                }
            }
        }

        console.log(`[${moment().format('HH:mm:ss:SSS')}] ${type} ${this.component}`, ':', ...args);
    }
}

