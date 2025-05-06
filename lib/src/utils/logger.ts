const origError = console.error;
const origWarn = console.warn;
const origInfo = console.info;
const origDebug = console.debug;

declare global {
    interface Console {
        protected: any
    }
}

enum LoggingLevel {
    debug = 0,
    info = 1,
    warn = 2,
    error = 3,
    protected = 4,
    none = 5
}

let loggingLevel = LoggingLevel.warn;
export function initLogging() {
    switch(process.env.LOGGING_LEVEL?.toLowerCase()) {
        case 'protected':
            loggingLevel = LoggingLevel.protected;
            break;
        case 'debug':
            loggingLevel = LoggingLevel.debug;
            break;
        case 'info':
            loggingLevel = LoggingLevel.info;
            break;
        case 'warn':
            loggingLevel = LoggingLevel.warn;
            break;
        case 'error':
            loggingLevel = LoggingLevel.error;
            break;
        case 'none':
            loggingLevel = LoggingLevel.none;
            break;
        default:
            loggingLevel = LoggingLevel.warn;
            break;
    }

    if(loggingLevel > LoggingLevel.protected) {
        console.protected = () => {};
    } else {
        console.protected = createLoggingFunction(origDebug);
    }
    if(loggingLevel > LoggingLevel.debug) {
        console.debug = () => {};
    } else {
        console.debug = createLoggingFunction(origDebug);
    }

    if(loggingLevel > LoggingLevel.info) {
        console.info = () => {};
    } else {
        console.info = createLoggingFunction(origInfo);
    }

    if(loggingLevel > LoggingLevel.warn) {
        console.warn = () => {};
    } else {
        console.warn = createLoggingFunction(origWarn);
    }

    if(loggingLevel > LoggingLevel.error) {
        console.error = () => {};
    } else {
        console.error = createLoggingFunction(origError);
    }
}

function createLoggingFunction(func: (...args: any[]) => void): (...args: any[]) => void {
    return (...args: any[]) => {
        for(let i = 0; i < args.length; i++) {
            if(typeof args[i] == 'object') {
                try {
                    args[i] = JSON.stringify(args[i]);
                } catch (err) {

                }
            }
        }

        func(...args);
    }
}
