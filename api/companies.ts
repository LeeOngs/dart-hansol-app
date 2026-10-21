import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadCompaniesPage } from './_lib/companyStore.js';
import { isValidDatasetYear } from '../src/services/companyStore.js';

// Paged because a year's list can hold thousands of companies and a Vercel
// function response is capped at 4.5MB. The client loops until cursor '0'.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { year } = req.query;
  if (!isValidDatasetYear(year)) {
    res.status(400).json({ error: 'year(예: 2026)가 필요합니다.' });
    return;
  }

  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '0';
  const page = await loadCompaniesPage(year, cursor);
  res.status(200).json(page);
}
