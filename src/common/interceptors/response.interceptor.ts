import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * ResponseInterceptor
 * -------------------
 * Purpose:
 * - Wrap all successful route responses in one consistent API shape.
 *
 * Summary:
 * - Reads the HTTP status code from the Express response.
 * - Returns { code, message, result }.
 * - Uses controller-provided { message, result } when present; otherwise defaults to 'success' and the raw data.
 */

// Standard API shape for successful responses
export interface ApiResponse<T> {
  code: number; // HTTP status code (e.g., 200, 201)
  message: string; // Short message, e.g. 'success' or a custom one from controller
  result: T | null; // Data payload or null
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  /**
   * Runs after the route handler but before sending the response.
   * - Gets current status code from response.
   * - Maps handler output to { code, message, result }.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data: any) => {
        return {
          code: response.statusCode,
          message: data?.message ?? 'success',
          result: data?.result ?? data ?? null,
        };
      }),
    );
  }
}
