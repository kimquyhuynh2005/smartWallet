import type { MailMessage } from './mail.service';

type Locale = string;
const vi = (l: Locale) => l !== 'en';

export function verifyEmailMail(to: string, name: string, link: string, locale: Locale): MailMessage {
  return vi(locale)
    ? { to, subject: 'Xác thực email SmartWallet', text: `Chào ${name},\n\nNhấn vào liên kết để xác thực email (hết hạn sau 24 giờ):\n${link}\n` }
    : { to, subject: 'Verify your SmartWallet email', text: `Hi ${name},\n\nOpen this link to verify your email (expires in 24 hours):\n${link}\n` };
}

export function resetPasswordMail(to: string, name: string, link: string, locale: Locale): MailMessage {
  return vi(locale)
    ? { to, subject: 'Đặt lại mật khẩu SmartWallet', text: `Chào ${name},\n\nNhấn vào liên kết để đặt lại mật khẩu (hết hạn sau 30 phút):\n${link}\n\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.\n` }
    : { to, subject: 'Reset your SmartWallet password', text: `Hi ${name},\n\nOpen this link to reset your password (expires in 30 minutes):\n${link}\n\nIgnore this email if you did not request it.\n` };
}
