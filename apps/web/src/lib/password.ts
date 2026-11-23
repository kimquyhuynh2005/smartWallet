/** Mirrors PasswordSchema in @smartwallet/shared (8-72 chars, a letter, a digit); `long` and symbols only raise the hint, never block. */
export interface PasswordCheck { len: boolean; letter: boolean; digit: boolean; long: boolean; valid: boolean; level: 0 | 1 | 2 | 3 | 4 }

export function checkPassword(pw: string): PasswordCheck {
  const len = pw.length >= 8 && pw.length <= 72;
  const letter = /[A-Za-z]/.test(pw);
  const digit = /\d/.test(pw);
  const long = pw.length >= 12;
  const valid = len && letter && digit;
  // invalid = weak; valid starts at fair and grows with length and a symbol
  const level: PasswordCheck['level'] = pw.length === 0 ? 0 : !valid ? 1 : ((2 + (long ? 1 : 0) + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0)) as 2 | 3 | 4);
  return { len, letter, digit, long, valid, level };
}
