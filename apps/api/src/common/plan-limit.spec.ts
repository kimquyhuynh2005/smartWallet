import { ForbiddenException } from '@nestjs/common';
import { assertWithinLimit } from './plan-limit';

describe('SUB-01 plan limits', () => {
  it('blocks the 4th wallet on Free with PLAN_LIMIT_REACHED (403)', () => {
    try {
      assertWithinLimit(3, 3, 'max_wallets');
      fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getStatus()).toBe(403);
      expect(((e as ForbiddenException).getResponse() as any).code).toBe('PLAN_LIMIT_REACHED');
    }
  });
  it('allows the 3rd wallet on Free', () => {
    expect(() => assertWithinLimit(3, 2, 'max_wallets')).not.toThrow();
  });
  it('null limit (Premium) is unlimited', () => {
    expect(() => assertWithinLimit(null, 999, 'max_wallets')).not.toThrow();
  });
});
