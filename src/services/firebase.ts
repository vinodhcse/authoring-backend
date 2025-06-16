import admin from 'firebase-admin';
import serviceAccount from '../config/firebaseServiceKey.json';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

dotenv.config(); // Make sure this is at the top
console.log('BUCKET:', process.env.FIREBASE_STORAGE_BUCKET);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Must be set in .env
});

const db = admin.firestore();
const bucket = getStorage().bucket();
export { db, admin, bucket };


