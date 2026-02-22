import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(20),
  JWT_REFRESH_SECRET: z.string().min(20),
  BID_HASH_SECRET: z.string().min(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.boolean().default(false),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  CLIENT_ERROR_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  CLIENT_ERROR_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  BID_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  BID_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  EMAIL_DELIVERY_MODE: z.enum(['stub', 'smtp']).default('stub'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export const env = EnvSchema.parse(process.env);
