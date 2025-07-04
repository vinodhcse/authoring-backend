import express, { Request, Response, NextFunction } from 'express';
import { db } from '../services/firebase';
import logger, { logExecutionTime } from '../utils/logger';
import { authorizeRole, selfAuthorizeRole, adminAuthorizeRole, authorizeNewBookCreation } from '../middleware/authorizeRole';


const router = express.Router({ mergeParams: true });

// PlotCanvas Routes
router.post('/plotCanvas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;
    const plotCanvasData = req.body;

    const versionRef = db.collection('books').doc(bookId).collection('versions').doc(versionId);
    if (!versionRef) {
      return res.status(404).send('Version not found');
    }

    await versionRef?.update({
      plotCanvas: {
        ...plotCanvasData,
        lastUpdated: new Date().toISOString(),
      },
    });
    const versionDoc = await versionRef.get();
    if (!versionDoc.exists) {
      return res.status(404).send('Plot Canvas not created successfully');
    } 
    res.status(201).send(versionDoc.data()?.plotCanvas);
  } catch (err) {
    logger.error('Failed to create PlotCanvas', err);
    next(err);
  }
});

router.get('/plotCanvas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;

    const versionDoc = await db.collection('books').doc(bookId).collection('versions').doc(versionId).get();

    if (!versionDoc.exists) {
      return res.status(404).send('Version not found');
    }

    const plotCanvas = versionDoc.data()?.plotCanvas;

    if (!plotCanvas) {
      return res.status(200).send({});
    }

    res.json(plotCanvas);
  } catch (err) {
    logger.error('Failed to retrieve PlotCanvas', err);
    next(err);
  }
});

router.patch('/plotCanvas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;
    const updateData = req.body;

    const versionRef = db.collection('books').doc(bookId).collection('versions').doc(versionId);

    await versionRef.update({
      'plotCanvas.nodes': updateData.nodes,
      'plotCanvas.timelineEvents': updateData.timelineEvents || [],
      'plotCanvas.lastUpdated': new Date().toISOString(),
    });

    res.status(200).send('PlotCanvas updated successfully');
  } catch (err) {
    logger.error('Failed to update PlotCanvas', err);
    next(err);
  }
});

router.delete('/plotCanvas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;

    const versionRef = db.collection('books').doc(bookId).collection('versions').doc(versionId);

    await versionRef.update({
      plotCanvas: null,
    });

    res.status(200).send('PlotCanvas deleted successfully');
  } catch (err) {
    logger.error('Failed to delete PlotCanvas', err);
    next(err);
  }
});


// Characters Routes
router.post('/characters',  logExecutionTime,  authorizeRole(['AUTHOR', 'CO_WRITER', 'EDITOR', 'REVIEWER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;
    const characterData = req.body;

    const characterRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('characters')
      .add({
        ...characterData,
        createdAt: new Date().toISOString(),
      });

    res.status(201).json({ id: characterRef.id });
  } catch (err) {
    logger.error('Failed to create character', err);
    next(err);
  }
});

router.get('/characters/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;

    const snapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('characters')
      .get();

    const characters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(characters);
  } catch (err) {
    logger.error('Failed to fetch characters', err);
    next(err);
  }
});

router.get('/characters/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, characterId } = req.params;

    const doc = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('characters')
      .doc(characterId)
      .get();

    if (!doc.exists) {
      res.status(404).send('Character not found');
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    logger.error('Failed to fetch character', err);
    next(err);
  }
});

router.patch('/characters/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, characterId } = req.params;
    const updateData = req.body;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('characters')
      .doc(characterId)
      .update(updateData);

    res.status(200).send('Character updated');
  } catch (err) {
    logger.error('Failed to update character', err);
    next(err);
  }
});

router.delete('/characters/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, characterId } = req.params;
    console.log('Deleting character:', characterId);
    const characterRef = db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('characters')
      .doc(characterId);

    const characterDoc = await characterRef.get();

    if (!characterDoc.exists) {
      logger.warn(`Character with ID ${characterId} not found`);
      return res.status(404).send('Character not found');
    }

    const dbres= await characterRef.delete(); // Physically delete the document
    console.log('dbres', dbres);
    logger.info(`Character deleted: ${characterId}`);
    res.status(200).send('Character deleted successfully');
  } catch (err) {
    logger.error('Failed to delete character', err);
    next(err);
  }
});

// World Routes
router.post('/world', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;
    const worldData = req.body;

    const worldRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('world')
      .add({
        ...worldData,
        createdAt: new Date().toISOString(),
      });

    res.status(201).json({ id: worldRef.id });
  } catch (err) {
    logger.error('Failed to create world', err);
    next(err);
  }
});

router.get('/world/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;

    const doc = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('world')
      .get();

      

    const worlds = doc.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (!worlds || worlds.length === 0) {
      res.status(404).send('World not found');
      return;
    }
    res.json(worlds);

    
    
  } catch (err) {
    logger.error('Failed to fetch world', err);
    next(err);
  }
});

router.get('/world/:worldId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, worldId } = req.params;

    const doc = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('world')
      .doc(worldId)
      .get();

    if (!doc.exists) {
      res.status(404).send('World not found');
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    logger.error('Failed to fetch world', err);
    next(err);
  }
});

router.patch('/world/:worldId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, worldId } = req.params;
    const updateData = req.body;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('world')
      .doc(worldId)
      .update(updateData);

    res.status(200).send('World updated');
  } catch (err) {
    logger.error('Failed to update world', err);
    next(err);
  }
});

router.delete('/world/:worldId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, worldId } = req.params;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('world')
      .doc(worldId)
      .delete();

    res.status(200).send('World deleted');
  } catch (err) {
    logger.error('Failed to delete world', err);
    next(err);
  }
});

// Timeline Routes
router.post('/timelineEvent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;
    const timelineEventData = req.body;

    const timelineEventRef = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('timelineEvent')
      .add({
        ...timelineEventData,
        createdAt: new Date().toISOString(),
      });

    res.status(201).json({ id: timelineEventRef.id });
  } catch (err) {
    logger.error('Failed to create timeline event', err);
    next(err);
  }
});

router.get('/timelineEvent/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId } = req.params;

    const snapshot = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('timelineEvent')
      .get();

    const timelineEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(timelineEvents);
  } catch (err) {
    logger.error('Failed to fetch timeline events', err);
    next(err);
  }
});

router.get('/timelineEvent/:timelineEventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, timelineEventId } = req.params;

    const doc = await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('timelineEvent')
      .doc(timelineEventId)
      .get();

    if (!doc.exists) {
      res.status(404).send('Timeline event not found');
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    logger.error('Failed to fetch timeline event', err);
    next(err);
  }
});

router.patch('/timelineEvent/:timelineEventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, timelineEventId } = req.params;
    const updateData = req.body;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('timelineEvent')
      .doc(timelineEventId)
      .update(updateData);

    res.status(200).send('Timeline event updated');
  } catch (err) {
    logger.error('Failed to update timeline event', err);
    next(err);
  }
});

router.delete('/timelineEvent/:timelineEventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bookId, versionId, timelineEventId } = req.params;

    await db
      .collection('books')
      .doc(bookId)
      .collection('versions')
      .doc(versionId)
      .collection('timelineEvent')
      .doc(timelineEventId)
      .delete();

    res.status(200).send('Timeline event deleted');
  } catch (err) {
    logger.error('Failed to delete timeline event', err);
    next(err);
  }
});


export default router;
