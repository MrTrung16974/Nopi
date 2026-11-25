import { createDb } from '../client.js';
import { seedReferenceData } from './reference-data.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Thiếu DATABASE_URL');
const { db, close } = createDb(url, { max: 1 });
try {
  const r = await seedReferenceData(db);
  console.log(`✔ Seed xong: ${r.subjects} môn, lớp 1 có ${r.grade1Subjects} môn`);
} finally {
  await close();
}
