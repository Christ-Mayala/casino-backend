import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { buildCors } from './config/cors';
import { connectMongo } from './config/mongo';
import router from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { initializeEmailService } from './services/email';
import { initializeCloudinaryService } from './services/cloudinary';

async function bootstrap() {
  await connectMongo();
  const app = express();
  app.use(helmet());
  app.use(buildCors());
  app.use(express.json({
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  } as any));
  app.use(morgan('dev'));
  // Journalisation personnalisée des requêtes (méthode, URL et utilisateur si authentifié)
  app.use((req, _res, next) => {
    const u = (req as any).user;
    console.log(`[REQ] ${req.method} ${req.url}`, u ? { user: u.email, role: u.role } : {});
    next();
  });

  // Initialize external services
  initializeEmailService();
  initializeCloudinaryService();

  app.get('/health', (_req, res) => res.json({ ok: true }));
  // Legacy routes (exact endpoints from existing repos)
  const { mountUserRoutes } = await import('./routes/userRoutes');
  await mountUserRoutes(app);
  const { mountStaffRoutes } = await import('./routes/staffLegacy');
  await mountStaffRoutes(app);
  // Dev bootstrap (non-production)
  const { mountDevRoutes } = await import('./routes/devRoutes');
  await mountDevRoutes(app);
  // MVC routes namespace (can coexist)
  app.use('/api', router);
  app.use(errorHandler);

  app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

bootstrap();
