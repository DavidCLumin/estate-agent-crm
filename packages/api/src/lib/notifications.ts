import { env } from './env';

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function logStubEmail(message: EmailInput) {
  // Dev/beta-safe fallback when SMTP is not configured.
  console.log('[EMAIL STUB]', JSON.stringify(message));
}

export async function sendEmail(message: EmailInput) {
  if (env.EMAIL_DELIVERY_MODE === 'stub') {
    logStubEmail(message);
    return { delivered: false, mode: 'stub' as const };
  }

  // SMTP mode placeholder keeps production config surface stable without forcing a paid provider in beta.
  // If SMTP vars are missing we safely degrade to stub logging.
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) {
    logStubEmail(message);
    return { delivered: false, mode: 'stub' as const };
  }

  // For now we keep mail transport provider-agnostic and non-blocking.
  logStubEmail({
    ...message,
    subject: `[SMTP STUBBED] ${message.subject}`,
  });
  return { delivered: false, mode: 'stub' as const };
}
