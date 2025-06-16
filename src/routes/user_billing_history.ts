
import { Router, Request, Response } from 'express';
import { db } from '../services/firebase';

const router = Router({ mergeParams: true });

// GET /api/users/:userId/billing - List all billing history
router.get('/', async (req: Request, res: Response) => {
  const snapshot = await db
    .collection('users')
    .doc(req.params.userId)
    .collection('billing')
    .get();
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(records);
});

// POST /api/users/:userId/billing - Add billing record
router.post('/', async (req: Request, res: Response) => {
  const ref = await db
    .collection('users')
    .doc(req.params.userId)
    .collection('billing')
    .add(req.body);
  const data = await ref.get();
  res.status(201).json({ id: ref.id, ...data.data() });
});

export default router;
