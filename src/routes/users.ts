import { Router, Request, Response } from 'express';
import { db } from '../services/firebase';
import logger, { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole } from '../middleware/authorizeRole';
import bcrypt from 'bcrypt';
const router = Router();

const defaultSettings =   {
    aiSettings: {
      aiEnabled: true,
      features: [
        {
          id: "rephrasing",
          enabled: true,
          label: "Rephrasing",
          prompt: "Rephrase the following text to be more concise and engaging.",
          llmModel: "default",
        },
        {
          id: "expanding",
          enabled: true,
          label: "Expanding",
          prompt: "Expand the following text with more details, inner monologue, and sensory imagery.",
          llmModel: "default",
        },
        {
          id: "concising",
          enabled: true,
          label: "Concising",
          prompt: "Shorten the following text with more details, inner monologue, and sensory imagery.",
          llmModel: "default",
        },
        {
          id: "generating",
          enabled: true,
          label: "Generating new lines",
          prompt: "Generate new lines based on the context provided.",
          llmModel: "default",
        },
        {
          id: "validation",
          enabled: true,
          label: "Validation",
          prompt: "Validate the following text for grammar, style, and coherence.",
          llmModel: "default",
        },
        {
          id: "planning",
          enabled: true,
          label: "Auto-updating Planning Boards",
          prompt: "Update the planning board with the latest context and details.",
          llmModel: "default",
        },
        {
          id: "suggestions",
          enabled: true,
          label: "Auto-suggest Next Lines",
          prompt: "Suggest the next lines based on the current context.",
          llmModel: "default",
        },
      ],
    },
    theme: {
      color: "blue",
      customColorHex: "#0000FF",
    },
    collaboration: {
      copyAllowed: true,
      allowComments: true,
      allowSuggestions: true,
      allowTrackChanges: false,
    },
    advanced: {
      temperature: 0.7,
      maxTokens: 1000,
      validationLevel: "balanced",
      tonePreset: "conversational",
      maxSentenceLength: "medium",
      vocabularyComplexity: "medium",
    },
  };

// GET all users
router.get('/', logExecutionTime, selfAuthorizeRole(), async (_, res) => {
  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(users);
});

// POST create user`
router.post('/', logExecutionTime, async (req, res) => {
  const userData = req.body;
  // validate user data
  if (!userData.email || !userData.password || !userData.name) {
    return res.status(400).json({ error: 'Email, password and name are required fields' });
  }
  // Check if email already exists
  const existingUserSnapshot = await db.collection('users').where('email', '==', userData.email).get();
  if (!existingUserSnapshot.empty) {
    return res.status(400).json({ error: 'Email already exists' });
  } 
  // Hash password
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  userData.password = hashedPassword;
  // Set default role if not provided
  if (!userData.globalRole) {
    userData.globalRole = 'FREE_USER'; // Default to FREE_USER
  } 
  userData.createdAt = new Date().toISOString();
  userData.updatedAt = new Date().toISOString();
  userData.lastLogin = new Date().toISOString();
  userData.settings = defaultSettings; // Assuming dafaultSettings is defined somewhere in your code
  console.log('Creating user with data:', userData);
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

// GET user by email
router.get('/email/:emailId', logExecutionTime, async (req, res) => {
  try {
    const { emailId } = req.params;
    console.log('Fetching user by email:', emailId);
    const snapshot = await db.collection('users').where('email', '==', emailId).get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();
    res.json({ id: userDoc.id, ...user });
  } catch (err) {
    logger.error('Failed to fetch user by email', err);
    res.status(500).json({ error: 'Failed to fetch user by email' });
  }
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


// PUT update user
router.patch('/:userId', logExecutionTime, selfAuthorizeRole(), async (req, res) => {
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
      console.log('Hashing password for user update');
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
