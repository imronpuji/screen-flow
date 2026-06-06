import type { ApiError } from './types';

export class ApiClientError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string[]>;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
  }
}
