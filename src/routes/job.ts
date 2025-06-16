import express from 'express';
import { db } from '../services/firebase';

const router = express.Router();

// Route to fetch job details
router.get('/:jobId', async (req, res) => {
  try {
    console.log('Fetching job details for:', req.params.jobId);
    const { jobId } = req.params;
    const jobDoc = await db.collection('jobs').doc(jobId).get();

    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json(jobDoc.data());
  } catch (error) {
    console.error('Error fetching job details:', error);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

export default router;
