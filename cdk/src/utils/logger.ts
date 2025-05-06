
const Reset = "\x1b[0m"
const Bright = "\x1b[1m"
const Dim = "\x1b[2m"
const Underscore = "\x1b[4m"
const Blink = "\x1b[5m"
const Reverse = "\x1b[7m"
const Hidden = "\x1b[8m"

const FgBlack = "\x1b[30m"
const FgRed = "\x1b[31m"
const FgGreen = "\x1b[32m"
const FgYellow = "\x1b[33m"
const FgBlue = "\x1b[34m"
const FgMagenta = "\x1b[35m"
const FgCyan = "\x1b[36m"
const FgWhite = "\x1b[37m"
const FgGray = "\x1b[90m"

const BgBlack = "\x1b[40m"
const BgRed = "\x1b[41m"
const BgGreen = "\x1b[42m"
const BgYellow = "\x1b[43m"
const BgBlue = "\x1b[44m"
const BgMagenta = "\x1b[45m"
const BgCyan = "\x1b[46m"
const BgWhite = "\x1b[47m"
const BgGray = "\x1b[100m"

export class LoggerClass {
    settings = {
        debug: false,
        info: false,
        warn: false,
        error: false
    };

    constructor() {
        const logLevel = process.env.LOG_LEVEL || 'warn';
        switch(logLevel) {
            case 'debug':
                this.settings.debug = true;
                this.settings.info = true;
                this.settings.warn = true;
                this.settings.error = true;
                break;
            case 'info':
                this.settings.info = true;
                this.settings.warn = true;
                this.settings.error = true;
                break;
            case 'warn':
                this.settings.warn = true;
                this.settings.error = true;
                break;
            case 'error':
                this.settings.error = true;
                break;
            case 'off':
                this.settings.error = false;
            default:
                this.settings.warn = true;
                this.settings.error = true;
        }
    }
    debug(...params: any[]) {
        if(this.settings.debug) {
            console.debug(FgBlue, '@mytaptrack/cdk', Reset, FgGray, 'debug:', ...params, Reset);
        }
    }
    info(...params: any[]) {
        if(this.settings.info) {
            console.info(FgBlue,'@mytaptrack/cdk', Reset, 'info:', ...params);
        }
    }
    warn(...params: any[]) {
        if(this.settings.warn) {
            console.warn(FgBlue, '@mytaptrack/cdk', Reset, FgYellow, 'warn:', ...params, Reset);
        }
    }
    error(...params: any[]) {
        if(this.settings.error) {
            console.error(FgBlue, '@mytaptrack/cdk', Reset, FgRed, 'error:', ...params, Reset);
        }
    }
}

export const logger = new LoggerClass();
