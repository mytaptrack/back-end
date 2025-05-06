export * from './api-device';
export * from './api-web';
export * from './cognito';
export * from './httpClient';
export * from './api-ql';

export async function wait(milliseconds: number) {
    await new Promise<void>((resolve) => {
        jest.useRealTimers();
        setTimeout(() => { resolve() }, milliseconds);
    });
}

export enum LoggingLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR,
    NONE
}

export function constructLogger(loggingLevel: LoggingLevel) {
    console.debug = (...args: any) => {
        if(loggingLevel >= LoggingLevel.DEBUG) {
            return;
        } 
        
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        console.log('DEBUG:', ...args);
    }
    console.info = (...args: any) => {
        if(loggingLevel >= LoggingLevel.INFO) {
            return;
        } 
        
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        console.log('INFO:', ...args);
    }
    console.warn = (...args: any) => {
        if(loggingLevel >= LoggingLevel.WARN) {
            return;
        }
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        console.log('WARN:', ...args);
    }
    console.error = (...args: any) => {
        if(loggingLevel >= LoggingLevel.ERROR) {
            return;
        }
        const parts = args.map(x => {
            if(typeof x == 'object') {
                return JSON.stringify(x, undefined, ' ');
            }
            return x;
        });

        console.log('ERROR:', ...args);
    }
}