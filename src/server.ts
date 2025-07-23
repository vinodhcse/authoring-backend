// === server.ts ===
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './utils/logger';
import usersRouter from './routes/users';
import booksRouter from './routes/books';
import versionsRouter from './routes/versions';
import chaptersRouter from './routes/chapters';
import commentsRouter from './routes/comments';
import subscriptionsRouter from './routes/subscriptions'
import billingRouter from './routes/billing';

import authRouter from './routes/auth';
import { authenticateJWT } from './middleware/authenticateJWT';
import filesRouter from './routes/files';
import jobsRouter from './routes/job';
import aifeatures from './routes/ai/aifeatures';



dotenv.config();

const app = express();
const port = process.env.PORT || 3000;


// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // You can adjust to 5mb, 10mb, etc.
app.use(express.urlencoded({ limit: '10mb', extended: true }));


// Structured request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const payloadSizeBytes = parseInt(req.headers['content-length'] || '0', 10);
    const payloadSizeMB = (payloadSizeBytes / (1024 * 1024)).toFixed(2); // Convert bytes to MB
    logger.info({
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${duration}ms`,
      payloadSize: `${payloadSizeMB} MB`,
      userToken: req.headers['authorization'] || 'anonymous'
    }, 'Request log');
  });
  next();
});

// === API Routes ===
app.use('/api/books', authenticateJWT, booksRouter);
app.use('/api/versions', authenticateJWT, versionsRouter);
app.use('/api/chapters', authenticateJWT, chaptersRouter);
app.use('/api/users', authenticateJWT, usersRouter);
app.use('/api/chapters/:chapterId/comments', authenticateJWT, commentsRouter); // dynamic chapter mount
app.use('/api/subscriptions', authenticateJWT, subscriptionsRouter);
app.use('/api/billing', authenticateJWT, billingRouter);
app.use('/api/files', authenticateJWT, filesRouter);
app.use('/api/jobs', authenticateJWT, jobsRouter);
app.use('/api/auth', authRouter);
app.use('/api/ai', authenticateJWT, aifeatures);
// Root
app.get('/', (_, res) => {
  res.json({ message: 'Authoring API backend is running.' });
});

// Start server
app.listen(port, () => {
  logger.info(`✅ Server is running on http://localhost:${port}`);
});

export default app;
