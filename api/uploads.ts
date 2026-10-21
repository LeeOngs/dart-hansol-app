import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadUploads } from './_lib/companyStore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const uploads = await loadUploads();
  res.status(200).json({ uploads });
}
