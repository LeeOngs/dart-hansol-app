import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword } from './_lib/adminAuth.js';
import { deleteCompany } from './_lib/companyStore.js';
import { isValidDatasetYear } from '../src/services/companyStore.js';

// Permanently removes one company from a year's shared list (admin only).
// The upload log's counts are history and are left as they were.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, year, key } = req.body ?? {};
  if (!(await isValidAdminPassword(adminPassword))) {
    res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
    return;
  }
  if (!isValidDatasetYear(year) || typeof key !== 'string' || !key) {
    res.status(400).json({ error: 'year와 key가 필요합니다.' });
    return;
  }

  const deleted = await deleteCompany(year, key);
  res.status(200).json({ deleted });
}
