import { applyDecorators, Body, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PageMetaSchema } from '@smartwallet/shared';
import { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZodPipe } from './zod.pipe';

/** Zod -> OpenAPI 3 schema. The SAME Zod schema validates requests and documents them, so Swagger cannot drift from validation. */
export function toSchema(s: ZodTypeAny): any {
  const j: any = zodToJsonSchema(s as any, { target: 'openApi3', $refStrategy: 'none' });
  delete j.$schema;
  return j;
}

/** @ZBody(Schema): validates (strict) AND documents the request body. */
export const ZBody = (schema: ZodTypeAny, opts: { multipart?: boolean } = {}): ParameterDecorator => (target, key, index) => {
  if (key === undefined) return;
  Body(new ZodPipe(schema))(target, key, index);
  if (!opts.multipart) ApiBody({ schema: toSchema(schema) })(target, key, Object.getOwnPropertyDescriptor(target, key)!);
};

/** @ZQuery(Schema): validates the whole query string (unknown params rejected) and documents each parameter. */
export const ZQuery = (schema: ZodTypeAny): ParameterDecorator => (target, key, index) => {
  if (key === undefined) return;
  Query(new ZodPipe(schema))(target, key, index);
  const json = toSchema(schema);
  const required: string[] = json.required ?? [];
  const desc = Object.getOwnPropertyDescriptor(target, key)!;
  for (const [name, prop] of Object.entries<any>(json.properties ?? {})) {
    ApiQuery({ name, required: required.includes(name), schema: prop })(target, key, desc);
  }
};

const ErrorEnvelope = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } },
};

/** Documents `{ data: T }` (or `{ data: T[], meta }` when list). */
export const ApiData = (schema: ZodTypeAny, opts: { status?: number; list?: boolean; array?: boolean; description?: string } = {}) => {
  const s = toSchema(schema);
  const data = opts.list || opts.array ? { type: 'array', items: s } : s;
  return ApiResponse({
    status: opts.status ?? 200,
    description: opts.description ?? 'Success',
    schema: {
      type: 'object',
      required: opts.list ? ['data', 'meta'] : ['data'],
      properties: opts.list ? { data, meta: toSchema(PageMetaSchema) } : { data }, // list = paginated (data + meta); array = plain array
    },
  });
};

export const ApiNoContent = (description = 'Success, no content') => ApiResponse({ status: 204, description });

const ERR_TEXT: Record<number, string> = {
  400: 'Validation error',
  401: 'Missing or invalid access token',
  403: 'Forbidden, or PLAN_LIMIT_REACHED',
  404: 'Not found (also returned for resources owned by another user)',
  409: 'Conflict',
  422: 'Business rule violation',
  429: 'Rate limited',
  501: 'Not configured',
};
export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(...statuses.map((status) => ApiResponse({ status, description: ERR_TEXT[status] ?? 'Error', schema: ErrorEnvelope })));
