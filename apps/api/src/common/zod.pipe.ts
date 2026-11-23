import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodObject, ZodTypeAny } from 'zod';

// Whitelist mode: unknown keys are rejected (strict), never silently trusted.
export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodTypeAny) {}

  transform(value: unknown) {
    const s = this.schema instanceof ZodObject ? this.schema.strict() : this.schema;
    const r = s.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid input', details: r.error.flatten() });
    }
    return r.data;
  }
}
