import express from 'express';
import { db } from '../services/firebase';
import logger, { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole } from '../middleware/authorizeRole';

const router = express.Router();

// GET all versions under a book
router.get('/:bookId/versions', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
  try {
    const { bookId } = req.params;  
    const snapshot = await db.collection('books').doc(bookId).collection('versions').get();
    const versions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(versions);
  } catch (err) {
    logger.error('Failed to fetch versions', err);
    res.status(500).send('Failed to fetch versions');
  }
});

// POST create a new version under a book
router.post('/:bookId/versions', logExecutionTime, authorizeRole(['AUTHOR', 'CO_WRITER']), async (req, res) => {
  try {
    const { bookId } = req.params;
    const { name, metaData } = req.body;
    const versionRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .add({
        name,
        createdAt: new Date().toISOString(),
        metaData: metaData || {}
      });
    res.status(201).json({ id: versionRef.id });
  } catch (err) {
    logger.error('Failed to create version', err);
    res.status(500).send('Failed to create version');
  }
});

// PATCH update a version
router.patch('/:bookId/versions/:versionId', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId } = req.params;
    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .update(req.body);
    res.status(200).send('Version updated');
  } catch (err) {
    logger.error('Failed to update version', err);
    res.status(500).send('Failed to update version');
  }
});

// DELETE a version and its chapters
router.delete('/:bookId/versions/:versionId', logExecutionTime, async (req, res) => {
  try {
    const { bookId, versionId } = req.params;
    const versionRef = db.collection('books').doc(bookId).collection('versions').doc(versionId);

    const chaptersSnapshot = await versionRef.collection('chapters').get();
    for (const chapterDoc of chaptersSnapshot.docs) {
      await chapterDoc.ref.delete();
    }

    await versionRef.delete();
    res.status(200).send('Version and chapters deleted');
  } catch (err) {
    logger.error('Failed to delete version', err);
    res.status(500).send('Failed to delete version');
  }
});

export default router;
