// Node.js global type declarations
declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;
declare const console: Console;
declare const Buffer: BufferConstructor;
declare function setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timeout;

interface BufferConstructor {
  from(str: string): Buffer;
}

interface Buffer {
  // Buffer interface
}

interface Console {
  log(...data: any[]): void;
  error(...data: any[]): void;
  warn(...data: any[]): void;
}