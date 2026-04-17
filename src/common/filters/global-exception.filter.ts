import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from 'src/common/logger/logger.service';

/**
 * Purpose
 * -------
 * GlobalExceptionFilter catches all thrown errors, logs them with LoggerService,
 * and returns a uniform JSON error response: { code, message, result }.
 */

/**
 * @Catch() with no arguments makes this a catch-all filter for HTTP requests.
 * It normalizes status and message for known HttpExceptions and generic Errors.
 * Stack traces are logged; responses do not include internal details.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Handles any exception reaching the HTTP layer.
   * - Determines HTTP status and message.
   * - Logs the error with optional stack.
   * - Sends a JSON response with { code, message, result }.
   */
  catch(exception: unknown, host: ArgumentsHost) {
    // Switch to HTTP context
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Default status and message
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    // HttpException branch
    if (exception instanceof HttpException) {
      status = exception.getStatus();

      // getResponse() may be a string or an object
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        // Prefer "message" when present (string or string[])
        message = (res as any).message ?? JSON.stringify(res);
      } else {
        message = res;
      }
    }
    // Generic Error branch
    else if (exception instanceof Error) {
      message = exception.message || message;
    }

    // Log error with optional stack trace
    this.logger.error(
      `HTTP ${status} - ${Array.isArray(message) ? message.join('; ') : message}`,
      exception instanceof Error ? exception.stack : undefined,
      'GlobalExceptionFilter',
    );

    // Base response body
    const body: Record<string, any> = {
      code: status,
      message: Array.isArray(message) ? message : message || 'Something went wrong',
      result: null,
    };

    // Enrich 429 Too Many Requests with machine-readable fields.
    // The throttler guard already sets a Retry-After header before this
    // filter runs; mirror it into the body so clients that read JSON
    // (mobile app, frontend) don't need to inspect headers separately.
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      body.error_code = 'rate_limited';
      const retryAfterHeader = response.getHeader('Retry-After');
      const retryAfterSeconds = Number(retryAfterHeader);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        body.retry_after_seconds = retryAfterSeconds;
      }
    }

    response.status(status).json(body);
  }
}
