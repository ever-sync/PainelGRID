import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry } from '../../config/sentry';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private normalizeMessage(message: unknown): string | string[] {
    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      return message
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
    }

    if (message && typeof message === 'object') {
      const nested = (message as Record<string, unknown>).message;
      if (typeof nested === 'string' || Array.isArray(nested)) {
        return this.normalizeMessage(nested);
      }
    }

    return 'Erro interno do servidor';
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Erro interno do servidor';
    const safePath = request.path || request.url.split('?')[0];

    const logPayload = JSON.stringify({
      statusCode: status,
      path: safePath,
      method: request.method,
      message:
        status >= 500
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'Request error',
      timestamp: new Date().toISOString(),
    });

    if (status >= 500) {
      this.logger.error(logPayload);
      Sentry.captureException(exception);
    } else {
      this.logger.warn(logPayload);
    }

    const normalizedMessage = this.normalizeMessage(message);

    response.status(status).json({
      statusCode: status,
      message: normalizedMessage,
      error: typeof message === 'string' ? message : (message as Record<string, unknown>).error,
      path: safePath,
      timestamp: new Date().toISOString(),
    });
  }
}
