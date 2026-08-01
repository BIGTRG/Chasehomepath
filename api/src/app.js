import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy (Hetzner + nginx/traefik) — trust it for correct req.ip / protocol.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / server-to-server (no Origin) and configured surfaces.
        // Disallowed origins get a clean deny (no ACAO headers), not a 500.
        return cb(null, !origin || env.cors.origins.includes(origin));
      },
      credentials: true,
    }),
  );
  // Camera-captured document uploads arrive as base64 JSON (8 MB file cap → ~11 MB encoded).
  app.use('/api/intake/documents', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'] }));
  }

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
