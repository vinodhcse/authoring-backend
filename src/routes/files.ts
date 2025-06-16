import express, { Request, Response } from 'express';
import multer from 'multer';
import { db, storage } from '../services/firebase';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const router = express.Router();

// Configure multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/books/:bookId/files
router.post('/:bookId/files', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const bookId = req.params.bookId;
    const file = req.file;
    const userId = (req as any).user?.userId;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileId = uuidv4();
    const fileName = `${fileId}_${file.originalname}`;
    const storagePath = `books/${bookId}/files/${fileName}`;

    // Upload file to Firebase Storage
    const bucket = storage.bucket();
    const fileRef = bucket.file(storagePath);
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Generate download URL
    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: '03-01-2030', // You can also secure with Firebase rules
    });

    // Save metadata in Firestore
    const metadata = {
      id: fileId,
      name: file.originalname,
      type: file.mimetype,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
      storagePath,
      downloadUrl: url,
      tags: req.body.tags?.split(',') || [],
      description: req.body.description || '',
    };

    await db.collection('books').doc(bookId).collection('files').doc(fileId).set(metadata);

    res.status(201).json(metadata);
  } catch (err) {
    logger.error('File upload failed', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.post('/:bookId/version/:versionId/chapter/:chapterid/files', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const bookId = req.params.bookId;
    const versionId = req.params.versionId;
    const chapterId = req.params.chapterid;
    const file = req.file;
    const userId = (req as any).user?.userId;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileId = uuidv4();
    const fileName = `${fileId}_${file.originalname}`;
    const storagePath = `books/${bookId}/version/${versionId}/chapter/${chapterId}files/${fileName}`;

    // Upload file to Firebase Storage
    const bucket = storage.bucket();
    const fileRef = bucket.file(storagePath);
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Generate download URL
    const [url] = await fileRef.getSignedUrl({
      action: 'read',
      expires: '03-01-2030', // You can also secure with Firebase rules
    });

    // Save metadata in Firestore
    const metadata = {
      id: fileId,
      name: file.originalname,
      type: file.mimetype,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
      storagePath,
      downloadUrl: url,
      tags: req.body.tags?.split(',') || [],
      description: req.body.description || '',
    };

    await db.collection('books')
            .doc(bookId)
            .collection('versions')
            .doc(versionId)
            .collection('chapters')
            .doc(chapterId)
            .collection('files').doc(fileId).set(metadata);

    res.status(201).json(metadata);
  } catch (err) {
    logger.error('File upload failed', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});



// GET /api/books/:bookId/files → List all files for a book
router.get('/:bookId/files', async (req: Request, res: Response) => {
  const { bookId } = req.params;

  try {
    const [files] = await bucket.getFiles({
      prefix: `books/${bookId}/`,
    });

    const fileList = files.map(file => ({
      name: file.name,
      publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
      contentType: file.metadata.contentType,
      size: file.metadata.size,
      createdAt: file.metadata.timeCreated,
    }));

    res.json(fileList);
  } catch (err) {
    logger.error('Failed to list files:', err);
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});




export default router;
