import express from 'express';
import cors from 'cors';
import { config } from './config';
import { getDatabase } from './database/connection';
import { initializeDatabase } from './database/schema';
import { seedDatabase } from './database/seed';
import { errorHandler } from './middleware/error-handler';

// Domain Routers
import authRoutes from './modules/auth/auth.routes';
import eventsRoutes from './modules/events/events.routes';
import teamsRoutes from './modules/teams/teams.routes';
import projectsRoutes from './modules/projects/projects.routes';
import submissionsRoutes from './modules/submissions/submissions.routes';
import galleryRoutes from './modules/gallery/gallery.routes';
import adminRoutes from './modules/admin/admin.routes';
import judgingRoutes from './modules/judging/judging.routes';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'DOGFOOD API',
      version: '1.0.0 (Tier 1 Complete)',
      timestamp: new Date().toISOString(),
      offlineReady: true,
      databaseType: config.databaseType
    });
  });

  // Mount API modules
  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/teams', teamsRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/submissions', submissionsRoutes);
  app.use('/api/gallery', galleryRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/judging', judgingRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export async function startServer() {
  try {
    const db = getDatabase();
    await initializeDatabase(db);
    await seedDatabase(db);

    const app = createApp();

    const server = app.listen(config.port, () => {
      console.log(`====================================================`);
      console.log(` DOGFOOD Backend running on port ${config.port}`);
      console.log(` Mode: ${config.env} | Offline-first: enabled`);
      console.log(` API Endpoint: http://localhost:${config.port}/api`);
      console.log(`====================================================`);
    });

    return server;
  } catch (err) {
    console.error('Failed to start DOGFOOD backend server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
