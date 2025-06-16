// src/middleware/logger.ts
import pino from 'pino';
import { Request, Response, NextFunction } from 'express';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' }
  }
});

export const logExecutionTime = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${ms}ms`
    });
  });
  next();
};

export default logger;
