export * from './api-device';
export * from './api-web';
export * from './cognito';
export * from './httpClient';
export * from './api-ql';
export * from './logging';

export async function wait(milliseconds: number) {
    await new Promise<void>((resolve) => {
        jest.useRealTimers();
        setTimeout(() => { resolve() }, milliseconds);
    });
}
