import path from 'path';
import * as fs from 'fs';
import { MttLogger, LoggingLevel } from '@mytaptrack/lib';
export { LoggingLevel } from '@mytaptrack/lib';

export class Logger extends MttLogger {
    
    constructor(component: string, level: LoggingLevel) {
        super(component, level);
    }

    debug(...args: any) {
        if(this.level > LoggingLevel.debug) {
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
        if(this.level > LoggingLevel.info) {
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
        if(this.level > LoggingLevel.warn) {
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
        if(this.level > LoggingLevel.error) {
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

        fs.mkdirSync('./logs', { recursive: true });
        // Append log to file or create the file if it doesn't exist
        const logFilePath = path.join('.', 'logs', `${sanitizedTestName}.log`);
        fs.appendFileSync(logFilePath, args.join(' ') + '\n');
    }
}
