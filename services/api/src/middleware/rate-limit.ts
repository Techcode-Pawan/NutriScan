import rateLimit from 'express-rate-limit';

const make = (windowMinutes: number, limit: number, what: string) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: { code: 'RATE_LIMITED', message: `Too many ${what} requests. Please wait a few minutes and try again.` } },
  });

export const generalLimiter = make(1, 300, 'API');
export const authLimiter = make(15, 20, 'login/registration');
export const ocrLimiter = make(10, 20, 'image analysis');
export const assistantLimiter = make(10, 40, 'assistant');
export const submissionLimiter = make(60, 20, 'submission');
