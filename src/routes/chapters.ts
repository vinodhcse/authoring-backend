import express from 'express';
import { db } from '../services/firebase';
import logger, { logExecutionTime } from '../utils/logger';

const router = express.Router();

// GET all chapters in a version
router.get('/:bookId/versions/:versionId/chapters', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId } = req.params;
    const snapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .get();

    const chapters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(chapters);
  } catch (err) {
    logger.error('Failed to fetch chapters', err);
    res.status(500).send('Failed to fetch chapters');
  }
});

// GET a single chapter
router.get('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId, chapterId } = req.params;
    const doc = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .doc(chapterId)
      .get();

    if (!doc.exists) return res.status(404).send('Chapter not found');

    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    logger.error('Failed to fetch chapter', err);
    res.status(500).send('Failed to fetch chapter');
  }
});

// POST create a new chapter
router.post('/:bookId/versions/:versionId/chapters', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId } = req.params;
    const { title, blocks, metaData } = req.body;

    const chapterRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .add({
        title,
        blocks: blocks || [],
        metaData: metaData || {},
        createdAt: new Date().toISOString()
      });

    res.status(201).json({ id: chapterRef.id });
  } catch (err) {
    logger.error('Failed to create chapter', err);
    res.status(500).send('Failed to create chapter');
  }
});

// PATCH update chapter title, metadata or content
router.patch('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId, chapterId } = req.params;
    const updateData = req.body;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .doc(chapterId)
      .update(updateData);

    res.status(200).send('Chapter updated');
  } catch (err) {
    logger.error('Failed to update chapter', err);
    res.status(500).send('Failed to update chapter');
  }
});

// DELETE a chapter
router.delete('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId, chapterId } = req.params;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .doc(chapterId)
      .delete();

    res.status(200).send('Chapter deleted');
  } catch (err) {
    logger.error('Failed to delete chapter', err);
    res.status(500).send('Failed to delete chapter');
  }
});

export default router;
