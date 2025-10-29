import { ILogger } from '../interfaces/service-context';

/**
 * Simple logger implementation for AWS Lambda
 */
export class LambdaLogger implements ILogger {
  private serviceName: string;

  constructor(config?: any) {
    this.serviceName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'lambda-function';
  }

  debug(message: string, metadata?: any): void {
    this.log('DEBUG', message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log('INFO', message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log('WARN', message, metadata);
  }

  error(message: string, metadata?: any): void {
    this.log('ERROR', message, metadata);
  }

  private log(level: string, message: string, metadata?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      requestId: process.env.AWS_REQUEST_ID,
      message,
      ...(metadata && { metadata })
    };

    console.log(JSON.stringify(logEntry));
  }
}