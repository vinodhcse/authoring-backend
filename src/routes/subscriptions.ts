import { Router } from 'express';
import { db } from '../services/firebase';
import { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole } from '../middleware/authorizeRole';
const router = Router();

// GET all subscriptions
router.get('/', logExecutionTime, selfAuthorizeRole(), async (_, res) => {
  const snapshot = await db.collection('subscriptions').get();
  const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(subs);
});

// POST new subscription
router.post('/', logExecutionTime,  selfAuthorizeRole(),  async (req, res) => {
  const ref = await db.collection('subscriptions').add(req.body);
  const doc = await ref.get();
  res.status(201).json({ id: doc.id, ...doc.data() });
});

// PUT update
router.put('/:subscriptionId', logExecutionTime,  selfAuthorizeRole(),  async (req, res) => {
  await db.collection('subscriptions').doc(req.params.subscriptionId).update(req.body);
  const updated = await db.collection('subscriptions').doc(req.params.subscriptionId).get();
  res.json({ id: updated.id, ...updated.data() });
});

// DELETE subscription
router.delete('/:subscriptionId', logExecutionTime,  selfAuthorizeRole(),  async (req, res) => {
  await db.collection('subscriptions').doc(req.params.subscriptionId).delete();
  res.status(204).send();
});


//get Subscriptiopn by ID
router.get('/:subscriptionId', logExecutionTime,  selfAuthorizeRole(),  async (req, res) => {
  const doc = await db.collection('subscriptions').doc(req.params.subscriptionId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Subscription not found' });
  res.json({ id: doc.id, ...doc.data() });
});

export default router;
