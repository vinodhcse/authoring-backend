import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../services/firebase';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'authoring_app';
const TOKEN_EXPIRY = '120m'; // Token valid for 7 days

// Signup
router.post('/signup', async (req, res) => {
  const { email, password, name, globalRole } = req.body;
  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (!snapshot.empty) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = globalRole || "FREE_USER"; // Default to FREE_USER if not provided
    if (!['FREE_USER', 'ADMIN', 'PAID_USER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }
    const userRef = await db.collection('users').add({
      email,
      password: hashedPassword,
      name,
      globalRole: role,
      createdAt: new Date().toISOString(),
    });

    const token = jwt.sign({ userId: userRef.id, email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
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
