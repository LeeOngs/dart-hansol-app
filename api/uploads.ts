import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadUploads } from './_lib/companyStore.js';
import { isValidAdminPassword } from './_lib/adminAuth.js';
import { yearsFromUploads } from '../src/services/companyStore.js';

// GET (public): only which dataset years exist, so visitors can pick one.
// POST { adminPassword } (admin only): the full upload log — labels, dates
// and added/skipped/failed counts are not shown to visitors.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    res.status(200).json({ years: yearsFromUploads(await loadUploads()) });
    return;
  }

  if (req.method === 'POST') {
    if (!isValidAdminPassword(req.body?.adminPassword)) {
      res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
      return;
    }
    res.status(200).json({ uploads: await loadUploads() });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
