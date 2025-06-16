import { Router, Request, Response } from 'express';
import { db } from '../services/firebase';
import logger, { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole } from '../middleware/authorizeRole';
import bcrypt from 'bcrypt';
const router = Router();

// GET all users
router.get('/', logExecutionTime, selfAuthorizeRole(), async (_, res) => {
  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(users);
});

// POST create user
router.post('/', logExecutionTime, async (req, res) => {
  const userData = req.body;
  const ref = await db.collection('users').add(userData);
  const doc = await ref.get();
  res.status(201).json({ id: doc.id, ...doc.data() });
});

// GET user by ID
router.get('/me', logExecutionTime, async (req, res) => {
   const jwtUserId = (req as any).user?.userId;
  const doc = await db.collection('users').doc(jwtUserId).get();
  if (!doc.exists) return res.status(404).json({ error: 'User not found' });
  res.json({ id: doc.id, ...doc.data() });
});


// GET user by ID
router.get('/:userId', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
  const doc = await db.collection('users').doc(req.params.userId).get();
  if (!doc.exists) return res.status(404).json({ error: 'User not found' });
  res.json({ id: doc.id, ...doc.data() });
});

// PUT update user
router.put('/:userId', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
  // Validate that the user is not trying to update their own role
  if ((req.params.userId === (req as any).user?.userId) && req.body.globalRole) {
    return res.status(403).json({ error: 'You cannot change your own role' });
  }
  // Update user data
  if (req.body.role && !authorizeRole(req.body.role)) {
    return res.status(400).json({ error: 'Invalid role specified' });  
  }
   const userData = { ...req.body };

    // Hash password if provided
    if (userData.password) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      userData.password = hashedPassword;
    }
  
    console.log('Updating user data:', userData);
  await db.collection('users').doc(req.params.userId).update(userData);
  const updated = await db.collection('users').doc(req.params.userId).get();
  res.json({ id: updated.id, ...updated.data() });
});

// DELETE user + cascade delete billing/subscription
router.delete('/:userId', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
  const userRef = db.collection('users').doc(req.params.userId);
  await userRef.delete();

  // Optional: delete user’s subscriptions + billing history
  const subs = await db.collection('subscriptions').where('userId', '==', req.params.userId).get();
  subs.forEach(doc => doc.ref.delete());

  const bills = await db.collection('billing').where('userId', '==', req.params.userId).get();
  bills.forEach(doc => doc.ref.delete());

  res.status(204).send();
});


// POST /api/users/:userId/subscriptions
router.post('/:userId/subscriptions', selfAuthorizeRole(), async (req: Request, res: Response) => {
  const userId = req.params.userId;

  const subData = req.body;

  try {
    // Check if the user exists
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check for existing subscription for the user
    const subsQuery = await db.collection('subscriptions')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!subsQuery.empty) {
      // Existing subscription found, update it
      const subDoc = subsQuery.docs[0];
      await db.collection('subscriptions').doc(subDoc.id).update(subData);

      logger.info(`Updated subscription for user ${userId}`);
      return res.status(200).json({ id: subDoc.id, updated: true });
    } else {
      // No existing subscription, create a new one
      const newSubRef = await db.collection('subscriptions').add({
        ...subData,
        userId // enforce userId for indexing
      });

      logger.info(`Created new subscription for user ${userId}`);
      return res.status(201).json({ id: newSubRef.id, created: true });
    }
  } catch (error) {
    logger.error('Error managing user subscription', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:userId/billing - List all billing history
router.get('/:userId/billing ', selfAuthorizeRole(), async (req: Request, res: Response) => {
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
