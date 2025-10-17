import path from 'path';
import * as fs from 'fs';

export enum LoggingLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}

export class Logger {
    constructor(private level: LoggingLevel) {
    }

    debug(...args: any) {
        if(this.level > LoggingLevel.DEBUG) {
            return;
        } 
        
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        this.writeToFileLog("DEBUG:", ...parts);
        return this;
    }

    info(...args: any) {
        if(this.level > LoggingLevel.INFO) {
            return;
        } 
        
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        this.writeToFileLog('INFO:', parts);
        return this;
    }

    warn(...args: any) {
        if(this.level > LoggingLevel.WARN) {
            return;
        }
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        this.writeToFileLog('WARN:', ...parts);
        return this;
    }
    
    error(...args: any) {
        if(this.level > LoggingLevel.ERROR) {
            return;
        }
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        this.writeToFileLog('ERROR:', ...parts);
        return this;
    }

    private writeToFileLog(...args) {
        let currentTestName = 'unknown-test';
        
        // Check if we're in a Jest context
        if (typeof expect !== 'undefined' && expect.getState) {
            try {
                const testState = expect.getState();
                currentTestName = testState?.currentTestName || 'unknown-test';
            } catch (error) {
                // Fallback if expect.getState() fails
                currentTestName = 'unknown-test';
            }
        }
        
        const sanitizedTestName = currentTestName.replace(/ /g, '_').replace(/[\/\\:*?"<>|]/g, '_');

        if(!fs.existsSync('./logs')) {
            fs.mkdirSync('./logs');
        }
        // Append log to file or create the file if it doesn't exist
        const logFilePath = path.join('.', 'logs', `${sanitizedTestName}.log`);
        fs.appendFileSync(logFilePath, args.join(' ') + '\n');
    }
}
