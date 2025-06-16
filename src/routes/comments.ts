import { Router, Request, Response } from 'express';
import { db } from '../services/firebase';
import { logExecutionTime } from '../utils/logger';

const router = Router({ mergeParams: true });

// GET comments for chapter
router.get('/', logExecutionTime, async (req, res) => {
  const snapshot = await db.collection('chapters')
    .doc(req.params.chapterId)
    .collection('comments')
    .get();

  const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(comments);
});

// POST comment
router.post('/', logExecutionTime, async (req, res) => {
  const ref = await db.collection('chapters')
    .doc(req.params.chapterId)
    .collection('comments')
    .add(req.body);

  const doc = await ref.get();
  res.status(201).json({ id: doc.id, ...doc.data() });
});

// PATCH update comment
router.patch('/:commentId', logExecutionTime, async (req, res) => {
  await db.collection('chapters')
    .doc(req.params.chapterId)
    .collection('comments')
    .doc(req.params.commentId)
    .update(req.body);

  const doc = await db.collection('chapters')
    .doc(req.params.chapterId)
    .collection('comments')
    .doc(req.params.commentId)
    .get();

  res.json({ id: doc.id, ...doc.data() });
});

// DELETE comment
router.delete('/:commentId', logExecutionTime, async (req, res) => {
  await db.collection('chapters')
    .doc(req.params.chapterId)
    .collection('comments')
    .doc(req.params.commentId)
    .delete();

  res.status(204).send();
});

export default router;
