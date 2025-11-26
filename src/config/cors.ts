import cors, { CorsOptions } from 'cors';
import { env } from './env';

export function buildCors(): ReturnType<typeof cors> {
  const opts: CorsOptions = {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.corsOrigins.length === 0 || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  };
  return cors(opts);
}
