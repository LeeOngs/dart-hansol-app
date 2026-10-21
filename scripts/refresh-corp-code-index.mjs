// Regenerates api/_lib/corpCodeIndex.json from DART's corpCode.xml.
//
// DART throttles this bulk download hard (~14KB/s) from cloud/datacenter IPs
// (confirmed empirically against a Vercel deployment — a 3.6MB file took
// 4+ minutes, impossible within any serverless function timeout). It is NOT
// throttled this way from an ordinary residential/office connection, so this
// script is meant to be run locally, and its output committed + redeployed.
//
// The company list changes slowly, so this only needs occasional refreshing
// (e.g. monthly, or whenever a lookup for a company you know is on DART
// surprisingly comes back "not found").
//
// Usage: node scripts/refresh-corp-code-index.mjs <DART_API_KEY>

import { unzipSync } from 'fflate';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const apiKey = process.argv[2] || process.env.DART_API_KEY;
if (!apiKey) {
  console.error('Usage: node scripts/refresh-corp-code-index.mjs <DART_API_KEY>');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'api', '_lib', 'corpCodeIndex.json');

console.log('Fetching corpCode.xml from DART...');
const t0 = Date.now();
const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`);
if (!res.ok) {
  console.error(`DART request failed: ${res.status}`);
  process.exit(1);
}
const buffer = new Uint8Array(await res.arrayBuffer());
console.log(`Downloaded ${buffer.length} bytes in ${Date.now() - t0}ms`);

const files = unzipSync(buffer);
const xml = new TextDecoder('utf-8').decode(files[Object.keys(files)[0]]);

const entries = [];
const listPattern = /<corp_code>([^<]*)<\/corp_code>\s*<corp_name>([^<]*)<\/corp_name>\s*<corp_eng_name>[^<]*<\/corp_eng_name>\s*<stock_code>([^<]*)<\/stock_code>/g;
let match;
while ((match = listPattern.exec(xml)) !== null) {
  entries.push({
    corpCode: match[1].trim(),
    corpName: match[2].trim(),
    stockCode: match[3].trim()
  });
}

writeFileSync(outPath, JSON.stringify(entries));
console.log(`Wrote ${entries.length} entries to ${outPath}`);
console.log('Remember to redeploy (git push / vercel --prod) for this to take effect.');
