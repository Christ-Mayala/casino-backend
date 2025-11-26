import 'dotenv/config';

function get(key: string, fallback?: string) {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${key}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '5000', 10),
  mongoUri: get('MONGO_URI'),
  jwtSecret: get('JWT_SECRET', 'dev-secret'),
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
};
