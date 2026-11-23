import { describe, expect, it } from 'vitest';
import { PasswordSchema } from '@smartwallet/shared';
import { checkPassword } from './password';

describe('password check agrees with the shared PasswordSchema', () => {
  it.each(['', 'abc', 'abcdefgh', '12345678', 'abcdefg1', 'Demo@12345', 'a1'.repeat(40), 'matkhau2026', 'Tiền-nhà-2026-ổn'])('%s', (pw) => {
    expect(checkPassword(pw).valid).toBe(PasswordSchema.safeParse(pw).success);
  });
  it('levels grow with length and variety, and an invalid password never reads as good', () => {
    expect(checkPassword('').level).toBe(0);
    expect(checkPassword('abcdefgh').level).toBe(1);
    expect(checkPassword('abcdefg1').level).toBeGreaterThanOrEqual(2);
    expect(checkPassword('abcdefghijk1!').level).toBe(4);
  });
});
