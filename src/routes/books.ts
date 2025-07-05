import express from 'express';
import { db, bucket } from '../services/firebase';
import logger, { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole, adminAuthorizeRole, authorizeNewBookCreation } from '../middleware/authorizeRole';
import multer from 'multer';
import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import FontSize from '@tiptap/extension-font-size';
import Blockquote from '@tiptap/extension-blockquote';
import TextAlign from '@tiptap/extension-text-align';
import HardBreak from '@tiptap/extension-hard-break';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { convertDocxToTiptapChapters } from "../utils/docxToTiptap";
import cors from "cors";
import fs from "fs";
import nodemailer from 'nodemailer';
import bookPlannerRouter from './bookPlanner';

// Configure multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();


// Fix collaborator filtering logic in the `/userbooks` route
router.get('/userbooks', logExecutionTime, async (req, res) => {
  const userId = (req as any).user?.userId;
  console.log('Fetching books for user:', userId);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid User' });
  }
  try {
    // 1. Books authored by user
    const authoredSnapshot = await db.collection('books')
      .where('authorId', '==', userId)
      .get();

    const authoredBooks = authoredSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log('Authored books:', authoredBooks.length, authoredBooks);

    // 2. Books where user is a collaborator
    const allBooksSnapshot = await db.collection('books').where('collaboratorIds', 'array-contains', userId).get();

    const editableBooks: any[] = [];
    const reviewableBooks: any[] = [];

    allBooksSnapshot?.docs?.forEach(doc => {
      const data = doc.data();
      const collab = (data.collaborators || []).find((c: any) => c.user_id === userId);

      if (!collab) return;

      if (collab.collaborator_type === 'EDITOR') {
        editableBooks.push({ id: doc.id, ...data });
      } else if (collab.collaborator_type === 'REVIEWER') {
        reviewableBooks.push({ id: doc.id, ...data });
      } else if (collab.collaborator_type === 'CO_WRITER') {
        authoredBooks.push({ id: doc.id, ...data });
      }
    });

    console.log('Editable books:', editableBooks);
    console.log('Reviewable books:', reviewableBooks);

    res.json({ authoredBooks, editableBooks, reviewableBooks });
  } catch (err) {
    logger.error('Failed to fetch user books', err);
    res.status(500).json({ error: 'Failed to fetch user books' });
  }
});


// GET all books
router.get('/', logExecutionTime, adminAuthorizeRole(), async (req, res) => {
  try {
    const snapshot = await db.collection('books').get();
    const books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(books);
  } catch (err) {
    logger.error('Failed to fetch books', err);
    res.status(500).send('Failed to fetch books');
  }
});

// GET a book
router.get('/:bookId', logExecutionTime, authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
  try {
    const doc = await db.collection('books').doc(req.params.bookId).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    logger.error('Failed to fetch books', err);
    res.status(500).send('Failed to fetch books');
  }
});


// POST invite a user to a book
router.post('/:bookId/invite', logExecutionTime, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    // Fetch book details
    const bookDoc = await db.collection('books').doc(bookId).get();
    if (!bookDoc.exists) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const bookData = bookDoc.data();
    const authorName = bookData?.authorName || 'Unknown Author';

    // Generate invitation token
    const invitationToken = uuidv4();

    // Create or update user record
    const userSnapshot = await db.collection('users').where('email', '==', email).get();
    if (userSnapshot.empty) {
      // Create new user
      await db.collection('users').add({
        email,
        globalRole: 'Unregistered',
        status: 'invited',
        invitationToken,
        invitedBy: authorName,
        invitedAt: new Date().toISOString(),
      });
    } else {
      // Update existing user
      const userRef = userSnapshot.docs[0].ref;
      await userRef.update({
        status: 'invited',
        invitationToken,
        invitedBy: authorName,
        invitedAt: new Date().toISOString(),
      });
    }

    // Send invitation email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your-email@gmail.com', // Replace with your email
        pass: 'your-email-password', // Replace with your email password
      },
    });

    const mailOptions = {
      from: 'noreply@authorstudio.com',
      to: email,
      subject: `Invitation to collaborate on ${bookData?.title}`,
      html: `
        <h1>You're Invited!</h1>
        <p>${authorName} has invited you to collaborate on the book titled <strong>${bookData?.title}</strong>.</p>
        <p>Your role: <strong>${role}</strong></p>
        <p>Click the link below to activate your account and join the collaboration:</p>
        <a href="https://your-app.com/activate?token=${invitationToken}">Activate Account</a>
        <p>If you did not expect this invitation, you can safely ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Invitation sent successfully' });
  } catch (err) {
    logger.error('Failed to invite user', err);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});



// POST create a book
router.post('/', logExecutionTime, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const { title, authorId, collaborators } = req.body;
    const bookRef = await db.collection('books').add({
      title,
      authorId: userId,
      authorName:  (req as any).user?.name || 'Unknown Author',
      collaborators: collaborators || [],
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ id: bookRef.id });
  } catch (err) {
    logger.error('Failed to create book', err);
    res.status(500).send('Failed to create book');
  }
});

// PATCH update book details
router.patch('/:bookId', logExecutionTime, authorizeRole(['AUTHOR', 'CO_AUTHOR']), async (req, res) => {
  try {
    const { bookId } = req.params;
    await db.collection('books').doc(bookId).update(req.body);
    res.status(200).send('Book updated');
  } catch (err) {
    logger.error('Failed to update book', err);
    res.status(500).send('Failed to update book');
  }
});

// DELETE a book and its versions/chapters
router.delete('/:bookId', logExecutionTime, authorizeRole(['AUTHOR', 'CO_AUTHOR']), async (req, res) => {
  try {
    const { bookId } = req.params;
    const bookRef = db.collection('books').doc(bookId);

    const versionsSnapshot = await bookRef.collection('versions').get();
    for (const versionDoc of versionsSnapshot.docs) {
      const chaptersSnapshot = await versionDoc.ref.collection('chapters').get();
      for (const chapterDoc of chaptersSnapshot.docs) {
        await chapterDoc.ref.delete();
      }
      await versionDoc.ref.delete();
    }

    await bookRef.delete();
    res.status(200).send('Book and nested data deleted');
  } catch (err) {
    logger.error('Failed to delete book', err);
    res.status(500).send('Failed to delete book');
  }
});

// GET all chapters in a version
router.get('/:bookId/versions/:versionId/chapters',  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), logExecutionTime, async (req, res) => {
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
router.get('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
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
router.post('/:bookId/versions/:versionId/chapters', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER']), async (req, res) => {
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


// PATCH reorder chapters in a version
router.patch('/:bookId/versions/:versionId/chapters/reorder', logExecutionTime, authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR']), async (req, res) => {
  try {
    const { bookId, versionId } = req.params;
    const { chapters } = req.body; // Expecting [{ id: chapterId, position: newPosition }]
    console.log('Starting reordering chapters Request:', chapters);
    if (!Array.isArray(chapters) || chapters.some(ch => !ch.id || !ch.position)) {
      return res.status(400).json({ error: 'Invalid payload format' });
    }
    console.log('Reordering chapters Request:', chapters);
    const batch = db.batch();

    chapters.forEach(({ id, position }) => {
      const chapterRef = db
        .collection('books')
        .doc(bookId)
        .collection('versions')
        .doc(versionId)
        .collection('chapters')
        .doc(id);

      batch.update(chapterRef, { position });
    });

    await batch.commit();

    res.status(200).send('Chapters reordered successfully');
  } catch (err) {
    logger.error('Failed to reorder chapters', err);
    res.status(500).send('Failed to reorder chapters');
  }
});



// PATCH update chapter title, metadata or content
router.patch('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR']), async (req, res) => {
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
router.delete('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER']), async (req, res) => {
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




// GET all comments for chapter
router.get('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
    try {
    const { bookId, versionId, chapterId } = req.params;
    const { title, blocks, metaData } = req.body;

    if (!bookId || !versionId || !chapterId) {
        return res.status(400).send('Missing required parameters: bookId, versionId, chapterId');
    }

    const snapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .doc(chapterId)
      .collection('comments')
      .get(); 
    
    const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (comments?.length === 0) {
      return res.status(404).send('No comments found for this chapter');
    }
    res.status(201).json(comments);
    
  } catch (err) {
    logger.error('Failed to create chapter', err);
    res.status(500).send('Failed to create chapter');
  }

 
});

// POST comment
router.post('/:bookId/versions/:versionId/chapters/:chapterId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
  
  try {
    const { bookId, versionId, chapterId } = req.params;
    const { title, blocks, metaData } = req.body;

        if (!bookId || !versionId || !chapterId) {
        return res.status(400).send('Missing required parameters: bookId, versionId, chapterId');
    }


    const chapterRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .doc(chapterId)
      .collection('comments')
      .add(req.body);      
    res.status(201).json({ id: chapterRef.id });
  } catch (err) {
    logger.error('Failed to create chapter', err);
    res.status(500).send('Failed to create chapter');
  }
});

// PATCH update comment
router.patch('/:bookId/versions/:versionId/chapters/:chapterId/comments/:commentId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
   try {
    const { bookId, versionId, chapterId, commentId } = req.params;
    const { title, blocks, metaData } = req.body;

        if (!bookId || !versionId || !chapterId || !commentId) {
        return res.status(400).send('Missing required parameters: bookId, versionId, chapterId');
    }


    const chapterRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .doc(chapterId)
      .collection('comments')
      .doc(commentId)
      .update(req.body);      
    res.status(201).json({ id: commentId });
  } catch (err) {
    logger.error('Failed to create chapter', err);
    res.status(500).send('Failed to create chapter');
  }
});


// Mount bookPlanner routes under /books/:bookId/versions/:versionId
router.use('/:bookId/versions/:versionId', bookPlannerRouter);


// DELETE comment
router.delete('/:commentId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
  await db.collection('chapters')
    .doc(req.params.chapterId)
    .collection('comments')
    .doc(req.params.commentId)
    .delete();

  res.status(204).send();
});




// POST /api/books/:bookId/files
router.post('/:bookId/files', upload.single('file'), authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, mimetype } = req.file;
    const { bookId } = req.params;
    const { tags, description } = req.body;
    const userId = (req as any).user?.userId;

    const fileName = `books/${bookId}/${Date.now()}_${originalname}`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
      metadata: {
        contentType: mimetype,
      },
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2030',
    });

    await db.collection('books').doc(bookId).collection('files').add({
      fileName: originalname,
      url,
      tags: tags?.split(',').map((tag: string) => tag.trim()) || [],
      description,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    });

    res.status(201).json({ message: 'File uploaded', url });
  } catch (error: any) {
    console.error('Upload failed:', error.message);
    return res.status(500).json({ error: 'File upload failed', details: error.message });
  }
});


router.post('/:bookId/versions/:versionId/chapters/:chapterId/files', upload.single('file'), async (req: Request, res: Response) => {
  try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { originalname, buffer, mimetype } = req.file;
      const { bookId, versionId, chapterId } = req.params;
      const { tags, description } = req.body;
      const userId = (req as any).user?.userId;

      const fileName = `books/${bookId}/${Date.now()}_${originalname}`;
      console.log('Request params:', req.params);
      console.log('Uploaded file:', req.file);
      const file = bucket.file(fileName);



      await file.save(buffer, {
        metadata: {
          contentType: mimetype,
        },
      });



      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2030',
      });

  

    // Save metadata in Firestore
    const metadata = {
      fileName: originalname,
      url,
      tags: tags?.split(',').map((tag: string) => tag.trim()) || ['default'],
      description: originalname,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    }

    console.log('File is uploaded successfully:', url);
    await db.collection('books')
            .doc(bookId)
            .collection('versions')
            .doc(versionId)
            .collection('chapters')
            .doc(chapterId)
            .collection('files').add(metadata);

    console.log('File is uploaded successfully in database', url);
    res.status(201).json({ message: 'File uploaded', url, metadata });
  } catch (err) {
    logger.error('File upload failed', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});



// GET /api/books/:bookId/files → List all files for a book
router.get('/:bookId/files', authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req: Request, res: Response) => {
  const { bookId } = req.params;

  try {

    const snapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('files')
      .get(); 
    
    const files = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (files?.length === 0) {
      return res.status(200).send('No Files found for this book');
    }
    res.status(201).json(files);
   
  } catch (err) {
    logger.error('Failed to list files:', err);
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});



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
    const { name, metaData, baseVersionId } = req.body;

    // Create a new version
    const versionRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .add({
        name,
        createdAt: new Date().toISOString(),
        metaData: metaData || {},
      });

    const newVersionId = versionRef.id;

    // If `existingVersion` is provided, clone its data
    if (baseVersionId) {
      const existingVersionRef = db.collection('books').doc(bookId).collection('versions').doc(baseVersionId);

      // Fetch existing version data
      const existingVersionDoc = await existingVersionRef.get();
      if (!existingVersionDoc.exists) {
        return res.status(404).json({ error: 'Existing version not found' });
      }

      const existingVersionData = existingVersionDoc.data();

      // Clone plotCanvas
      if (existingVersionData?.plotCanvas) {
        await db
          .collection('books')
          .doc(bookId)
          .collection('versions')
          .doc(newVersionId)
          .update({ plotCanvas: existingVersionData.plotCanvas });
      }

      // Clone chapters
      const chaptersSnapshot = await existingVersionRef.collection('chapters').get();
      const batch = db.batch();
      chaptersSnapshot.docs.forEach((chapterDoc) => {
        const chapterData = chapterDoc.data();
        const newChapterRef = db
          .collection('books')
          .doc(bookId)
          .collection('versions')
          .doc(newVersionId)
          .collection('chapters')
          .doc();
        batch.set(newChapterRef, chapterData);
      });
      await batch.commit();
    }

    res.status(201).json({ id: newVersionId });
  } catch (err) {
    logger.error('Failed to create version', err);
    res.status(500).send('Failed to create version');
  }
});



// GET all versions under a book
router.get('/:bookId/versions/:versionId', logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req, res) => {
  try {
    const { bookId, versionId } = req.params;
    const snapshot = await db.collection('books').doc(bookId).collection('versions').doc(versionId).get();
    if (!snapshot.exists) {
      return res.status(404).send('Version not found');
    }
    const versionDoc = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    res.json(versionDoc);
  } catch (err) {
    logger.error('Failed to fetch versions', err);
    res.status(500).send('Failed to fetch versions');
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

// New route to handle .docx import
router.post('/:bookId/versions/:versionId/import-docx', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { bookId, versionId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const convertedChapters = await convertDocxToTiptapChapters(file.buffer);
    //console.log('Converted JSON of the entire docx:', convertedChapters);
    if (!convertedChapters || !Array.isArray(convertedChapters) || convertedChapters.length === 0) {
      return res.status(400).json({ error: 'No chapters found or invalid .docx structure' });
    }
    //console.log('Converted JSON of the entire docx:', convertedChapters);
    // Process the .docx file and extract chapters
    
    const jobId = await createJobTracker(convertedChapters.length, bookId, versionId);
    console.log('Job ID resposne:', jobId);
    processDocxFile(convertedChapters, bookId, versionId, jobId);

    res.status(202).json({ message: 'Import started', jobId });
  } catch (error) {
    console.error('Error importing .docx:', error);
    res.status(500).json({ error: 'Failed to import .docx' });
  }
});

// Helper function to process .docx file
const processDocxFile = async (convertedJson: any, bookId: string, versionId: string, jobId: string) => {
  
 
  
   const snapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('chapters')
      .get();

    const bookChapters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let position = 1;
    if (bookChapters) {
      position = bookChapters?.length + 1;
    }


  for (let i = 0; i < convertedJson.length; i++) {
    const chapter = convertedJson[i];
   // const tipTapJSON = convertHTMLToTipTapJSON(chapter.content);
    console.log(`Processing chapter ${i + 1}:`, chapter.title);
    await saveChapterToDB(bookId, versionId, chapter.title, chapter?.content, position);
    updateJobTracker(jobId, i + 1, convertedJson.length);
    position = position + 1;
    console.log(`Chapter ${i + 1} saved successfully`);
  }

  

  return jobId;
};

// Function to extract chapters from HTML
const extractChaptersFromHTML = (html: string) => {
  const chapters = [];
  const sceneBreakMarkers = ['***', '---', '* * *', '~ ~ ~'];

  const sections = html.split(/<h[1-6]>/);
  sections.forEach((section) => {
    const content = section.replace(/<\/?.*?>/g, '');
    const isSceneBreak = sceneBreakMarkers.some((marker) => content.includes(marker));

    if (!isSceneBreak) {
      chapters.push({ title: extractTitle(section), content });
    }
  });

  return chapters;
};

// Function to extract title from HTML section
const extractTitle = (htmlSection: string): string => {
  // Match the first heading tag (e.g., <h1>, <h2>, etc.)
  const match = htmlSection.match(/<h[1-6]>(.*?)<\/h[1-6]>/);
  return match ? match[1].trim() : 'Untitled Chapter'; // Default to 'Untitled Chapter' if no title is found
};

// Function to convert HTML to TipTap JSON
const convertHTMLToTipTapJSON = (html: string) => {
  const editor = new Editor({
    extensions: [
      StarterKit,
      Bold,
      Italic,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Blockquote,
      TextAlign,
      HardBreak,
      BulletList,
      OrderedList,
      ListItem,
    ],
    content: html,
  });

  return editor.getJSON();
};

// Function to save chapter to Firestore
const saveChapterToDB = async (bookId: string, versionId: string, title: string, content: any, position: number) => {
  const chapterId = uuidv4();
  const chapterData = {
    title,
    position: position || 0,
    content: {blocks: content || []},
    createdAt: new Date().toISOString(),
  };

  await db.collection('books')
          .doc(bookId)
          .collection('versions')
          .doc(versionId)
          .collection('chapters')
          .add(chapterData);
};

// Job tracker functions
const jobStatus: Record<string, { total: number; completed: number }> = {};

const createJobTracker = (totalChapters: number, bookId: string, versionId: string) => {
  
  
  const jobId  = saveJobToDB( bookId, versionId, totalChapters).catch(err => {
    logger.error('Failed to save job to DB:', err);
  });
  return jobId;
};

const updateJobTracker = (jobId: string, completed: number, total: number) => {
  jobStatus[jobId] = { total, completed };
  updateJobInDB(jobId, completed, total === completed ? 'Completed' : 'In Progress').catch(err => {
    logger.error('Failed to update job in DB:', err);
  });
};

const getJobStatus = (jobId: string) => {
  return jobStatus[jobId];
};

// Save job details to Firestore
const saveJobToDB = async (bookId: string, versionId: string, totalChapters: number) => {
  const jobData = {
    bookId,
    versionId,
    totalChapters,
    completedChapters: 0,
    status: 'In Progress',
    createdAt: new Date().toISOString(),
  };

  const jobref = await db.collection('jobs').add(jobData);
  console.log(`Job created with ID: ${jobref.id} for book ${bookId}, version ${versionId}`);
  return jobref.id;
  
};

const updateJobInDB = async (jobId: string, completedChapters: number, status: string) => {
  await db.collection('jobs').doc(jobId).update({
    completedChapters,
    status,
    updatedAt: new Date().toISOString(),
  });
};




export default router;
