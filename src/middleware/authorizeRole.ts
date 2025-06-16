// src/middleware/authorizeRole.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../services/firebase';

export const authorizeRole = (requiredRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId;
    const bookId = req.params.bookId;
    const globalRole = (req as any).user?.globalRole;

    if (!userId || !bookId) {
      return res.status(403).json({ error: 'Missing user or book context' });
    }

    const bookDoc = await db.collection('books').doc(bookId).get();
    const book = bookDoc.data();

    if (!book) return res.status(404).json({ error: 'Book not found' });

    if (book.authorId === userId) {
      // If the user is the author, they have all permissions
      return next();
    }

    if (globalRole === 'ADMIN' || globalRole === 'PAID_USER') {
      return next();
    }

    const collaborator = book.collaborators?.find((c: any) => c.userId === userId);

    if (!collaborator || !requiredRoles.includes(collaborator.role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    

    next();
  };
};

export const authorizeNewBookCreation = (requiredRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId;
    const globalRole = (req as any).user?.globalRole;
    if (!userId) {
      return res.status(403).json({ error: 'Missing user or book context' });
    }

    if (globalRole === 'ADMIN' || globalRole === 'PAID_USER') {
      return next();
    } else {
      return res.status(403).json({ error: 'You do not have permission to create new books' });
    }

    

    next();
  };
};


export const selfAuthorizeRole = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const jwtUserId = (req as any).user?.userId;
    const globalRole = (req as any).user?.globalRole;

    const paramUserId = req.params?.userId;
    const bodyUserId = req.body?.userId;
    console.log('ASuthorizing user');
    console.log('JWT User ID:', jwtUserId);
    console.log('paramUserId:', paramUserId);        
    console.log('bodyUserId:', bodyUserId);        
    console.log('globalRole:', globalRole);

    if (!jwtUserId) {
      return res.status(403).json({ error: 'Unauthorized: Missing user in token' });
    }

    // Allow if user is admin
    if (globalRole === 'ADMIN') {
      return next();
    }

    // Allow if the user is acting on their own data (from either body or params)
    if (paramUserId && paramUserId === jwtUserId) {
      return next();
    }

    if (bodyUserId && bodyUserId === jwtUserId) {
      return next();
    }

    return res.status(403).json({ error: 'Only self or admin can access this resource' });
  };
};


export const adminAuthorizeRole = () => {
 return async (req: Request, res: Response, next: NextFunction) => {
    const globalRole = (req as any).user?.globalRole;

    if (globalRole === 'ADMIN') {
      return next();
    }

    return res.status(403).json({ error: 'Admin access required' });
  };
};
