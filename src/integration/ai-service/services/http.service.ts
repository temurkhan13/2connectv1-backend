/**
 * AI Service HTTP Client
 * -----------------------
 * Low-level HTTP client for making requests to AI service
 * Handles request/response logging, error handling, and retries
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import type { AIServiceConfig } from '../config/ai-service.config';

@Injectable()
export class AIServiceHttpClient {
  private readonly logger = new Logger(AIServiceHttpClient.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly config: AIServiceConfig) {
    this.httpClient = this.createHttpClient();
    this.setupInterceptors();
  }

  /**
   * Create configured axios instance
   */
  private createHttpClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.apiKey,
      },
    });
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      config => {
        const method = config.method?.toUpperCase();
        const url = config.url;
        this.logger.log(`[REQUEST] ${method} ${url}`);

        if (config.data) {
          this.logger.debug(`[REQUEST PAYLOAD] ${JSON.stringify(config.data)}`);
        }

        return config;
      },
      (error: AxiosError) => {
        this.logger.error(`[REQUEST ERROR] ${error.message}`);
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      response => {
        const method = response.config.method?.toUpperCase();
        const url = response.config.url;
        const status = response.status;

        this.logger.log(`[RESPONSE] ${status} ${method} ${url}`);
        this.logger.debug(`[RESPONSE DATA] ${JSON.stringify(response.data)}`);

        return response;
      },
      (error: AxiosError) => {
        const method = error.config?.method?.toUpperCase();
        const url = error.config?.url;
        const status = error.response?.status || 'NO_STATUS';

        this.logger.error(`[RESPONSE ERROR] ${status} ${method} ${url}`);

        if (error.response?.data) {
          this.logger.error(`[ERROR DETAILS] ${JSON.stringify(error.response.data)}`);
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Retry a request with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    baseDelay: number = 1000,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;

        // Only retry on 500, 502, 503, 504, or network errors
        const isRetryable = !status || status >= 500;
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        this.logger.warn(`[RETRY] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Make POST request with retry
   */
  async post<T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.withRetry(async () => {
      const response = await this.httpClient.post<T>(endpoint, data, config);
      return response.data;
    });
  }

  /**
   * Make GET request
   */
  async get<T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.httpClient.get<T>(endpoint, config);
    return response.data;
  }

  /**
   * Make PUT request
   */
  async put<T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.httpClient.put<T>(endpoint, data, config);
    return response.data;
  }

  /**
   * Make DELETE request
   */
  async delete<T = any>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.httpClient.delete<T>(endpoint, config);
    return response.data;
  }
}
