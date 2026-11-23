import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';

// Wraps results as { data } or { data, meta }. Paginated services return { items, meta }.
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((r: any) => {
        if (r && typeof r === 'object' && 'items' in r && 'meta' in r) return { data: r.items, meta: r.meta };
        if (r && typeof r === 'object' && Object.keys(r).length === 1 && 'status' in r) return r; // /health
        return { data: r };
      }),
    );
  }
}
