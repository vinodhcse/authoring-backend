import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../services/firebase';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'authoring_app';
const TOKEN_EXPIRY = '120m'; // Token valid for 7 days
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


// Signup
router.post('/signup', async (req, res) => {
  //const { email, password, name, globalRole } = req.body;
   const userData = req.body;
  try {
    
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
    
      userData.createdAt = new Date().toISOString();
      userData.updatedAt = new Date().toISOString();
      userData.lastLogin = new Date().toISOString();
      userData.settings = defaultSettings; // Assuming dafaultSettings is defined somewhere in your code
      console.log('Creating user with data:', userData);

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    userData.password = hashedPassword;
    userData.globalRole = userData.globalRole || "FREE_USER"; // Default to FREE_USER if not provided
    
    if (!['FREE_USER', 'ADMIN', 'PAID_USER'].includes(userData.globalRole)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    console.log('Creating user with data:', userData);
    const userRef = await db.collection('users').add(userData);

    const token = jwt.sign({ userId: userRef.id, email: userData.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.status(201).json({ token, userId: userRef.id });
  } catch (err) {
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snapshot.empty) return res.status(401).json({ error: 'Invalid credentials' });

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: userDoc.id, email, globalRole: user.globalRole }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ token, userId: userDoc.id, globalRole: user.globalRole, name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
  const refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    res.status(401).json({ error: 'Missing refresh token' });
    return;
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET!);

    const newAccessToken = jwt.sign(
      {
        userId: (decoded as any).userId,
        email: (decoded as any).email,
        globalRole: (decoded as any).globalRole
      },
      process.env.JWT_SECRET!,
      { expiresIn: '120m' }
    );

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

export default router;
