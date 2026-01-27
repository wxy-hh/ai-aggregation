export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

class ConsoleLogger implements Logger {
  private formatLog(level: string, message: string, meta?: Record<string, unknown>) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.log(this.formatLog('info', message, meta));
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    console.error(
      this.formatLog('error', message, {
        ...meta,
        error: error?.message,
        stack: error?.stack,
      })
    );
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.formatLog('warn', message, meta));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatLog('debug', message, meta));
    }
  }
}

export const logger = new ConsoleLogger();
