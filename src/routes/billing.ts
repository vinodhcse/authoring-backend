import { Router } from 'express';
import { db } from '../services/firebase';
import { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole } from '../middleware/authorizeRole';
const router = Router();

// GET billing history
router.get('/', logExecutionTime, selfAuthorizeRole(), async (_, res) => {
  const snapshot = await db.collection('billing').get();
  const bills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(bills);
});

// POST new bill
router.post('/', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
  const ref = await db.collection('billing').add(req.body);
  const doc = await ref.get();
  res.status(201).json({ id: doc.id, ...doc.data() });
});

// UPDATE bill
router.put('/:billId', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
  await db.collection('billing').doc(req.params.billId).update(req.body);
  const updated = await db.collection('billing').doc(req.params.billId).get();
  res.json({ id: updated.id, ...updated.data() });
});

// DELETE bill
router.delete('/:billId', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
  await db.collection('billing').doc(req.params.billId).delete();
  res.status(204).send();
});

export default router;
