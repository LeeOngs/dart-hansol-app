/**
 * Bulk-registers a large company list (thousands of rows) into the shared
 * company list — for the initial load, which is too big to drive from a
 * browser tab (and DART throttles overseas IPs to ~14KB/s; from a
 * local PC it doesn't).
 *
 * Needs only DART_API_KEY and the shared ADMIN_PASSWORD in .env.local
 * (대량업로드.bat asks for them on first run); saving goes through the site's API.
 *
 *   npx tsx --env-file=.env.local scripts/bulk-upload.ts <file.xlsx|csv|json> --year 2026 [--label "이름"] [--concurrency 3]
 *   npx tsx --env-file=.env.local scripts/bulk-upload.ts <file> --dry-run --limit 20   (speed test, saves nothing)
 *
 * Uses the same analysis as the web app (src/services/companyAnalysis.ts):
 * exact bizr_no match, ratings only from 채무증권 증권신고서. Each --year is its
 * own list; companies already in that year's list are skipped. Progress is checkpointed to .bulk-progress/,
 * so an interrupted run — including hitting DART's 20,000 requests/day cap —
 * resumes where it stopped when re-run with the same file. Companies whose
 * lookup fails are not saved; re-running the same file retries just those.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { CompanyAnalysisResult, CompanyRawData } from '../src/types.js';
import { normalizeRawDataList } from '../src/utils/excelUtils.js';
import { describeRatingSource } from '../src/utils/ratingSource.js';
import { analyzeCompany, runPool } from '../src/services/companyAnalysis.js';
import type { DartBackend } from '../src/services/companyAnalysis.js';
import { companyKey, dedupeCompanies, isValidDatasetYear } from '../src/services/companyStore.js';
import {
  findDartCorp,
  listBondFilings,
  checkFilingForRating,
  checkAnnualReportRating,
  DartApiError,
  DART_DAILY_LIMIT_STATUS
} from '../api/_lib/dartLookup.js';
import type { StoredCompanyResult, UploadBatch } from '../src/types.js';

// Reads and saves through the site's API with the shared admin password, so
// an admin needs only that password and a DART key — never the store's
// credentials.
const APP_URL = (process.env.APP_URL || 'https://dart-hansol-app.vercel.app').replace(/\/$/, '');
const SAVE_CHUNK_SIZE = 500; // keeps each save request well under Vercel's 4.5MB body limit

async function postApi<T>(pathname: string, body: unknown): Promise<T> {
  const res = await fetch(`${APP_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) throw new Error(data.error || `${pathname} 요청 실패 (${res.status})`);
  return data as T;
}

async function loadExistingKeys(year: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let cursor = '0';
  do {
    const res = await fetch(`${APP_URL}/api/companies?year=${year}&cursor=${cursor}`);
    if (!res.ok) throw new Error(`기존 기업 목록을 불러오지 못했습니다 (${res.status})`);
    const page = await res.json() as { companies: StoredCompanyResult[]; cursor: string };
    for (const c of page.companies) keys.add(companyKey(c.company));
    cursor = page.cursor;
  } while (cursor !== '0');
  return keys;
}

async function saveViaApi(params: {
  adminPassword: string;
  year: string;
  label?: string;
  results: CompanyAnalysisResult[];
  skippedCount: number;
  failedCount: number;
}): Promise<UploadBatch> {
  let upload: UploadBatch | undefined;
  for (let i = 0; i < params.results.length || i === 0; i += SAVE_CHUNK_SIZE) {
    const first = upload === undefined;
    ({ upload } = await postApi<{ upload: UploadBatch }>('/api/upload-finalize', {
      adminPassword: params.adminPassword,
      year: params.year,
      label: params.label,
      results: params.results.slice(i, i + SAVE_CHUNK_SIZE),
      skippedCount: first ? params.skippedCount : 0,
      failedCount: first ? params.failedCount : 0,
      appendToId: upload?.id
    }));
  }
  return upload!;
}

const ATTEMPTS_PER_COMPANY = 3;
const CHECKPOINT_EVERY = 20;

// DART temporarily blocks an IP (connections reset) when it sends requests
// too fast — confirmed on the first real 571-company run. Spacing requests
// out avoids that; ~3 requests per company keeps 3,000 companies ~30 minutes.
const MIN_MS_BETWEEN_DART_REQUESTS = 200;
// Once this many lookups in a row fail at the network level, DART is
// assumed to be blocking us: stop (progress is kept) instead of recording
// every remaining company as failed.
const BLOCKED_AFTER_CONSECUTIVE_NETWORK_ERRORS = 8;
const NETWORK_RETRY_WAIT_MS = 15000;
const BLOCKED_EXIT_CODE = 3; // bulk-upload-wizard.ts reads this

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && err.message === 'fetch failed';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv: string[]) {
  const args = { file: '', year: '', label: undefined as string | undefined, dryRun: false, limit: Infinity, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year') args.year = argv[++i];
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (!a.startsWith('--')) args.file = a;
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (!args.file || !isValidDatasetYear(args.year)) {
    throw new Error('사용법: npx tsx --env-file=.env.local scripts/bulk-upload.ts <파일> --year 2026 [--label 이름] [--dry-run] [--limit N] [--concurrency N]');
  }
  return args;
}

function readCompanies(file: string): CompanyRawData[] {
  if (file.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return normalizeRawDataList(Array.isArray(data) ? data : [data]);
  }
  const workbook = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return normalizeRawDataList(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet));
}

function describe(r: CompanyAnalysisResult): string {
  if (r.dartSource === 'LIVE_DART') return `${r.creditRating} ${r.ratingStatus === 'PASS' ? '선정' : '미달'} (${describeRatingSource(r.ratingSource)})`;
  if (r.dartSource === 'ON_DART_NO_RATING') return 'DART 등록 · 등급 미확인';
  return 'DART 미등록';
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분` : s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DART_API_KEY;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!apiKey || !adminPassword) {
    throw new Error('.env.local에 DART_API_KEY와 ADMIN_PASSWORD가 필요합니다. 대량업로드.bat을 실행하면 처음 한 번 입력받아 저장합니다.');
  }
  // Fail now rather than after a long run.
  if (!args.dryRun) {
    await postApi('/api/admin-login', { password: adminPassword }).catch(() => {
      throw new Error('관리자 비밀번호가 올바르지 않습니다. .env.local의 ADMIN_PASSWORD를 확인하세요.');
    });
  }

  // Count DART calls (to compare against the daily cap) and space them out
  // across all workers.
  let dartRequests = 0;
  let nextDartSlot = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input instanceof Request ? input.url : input).includes('opendart.fss.or.kr')) {
      dartRequests++;
      const now = Date.now();
      const slot = Math.max(now, nextDartSlot);
      nextDartSlot = slot + MIN_MS_BETWEEN_DART_REQUESTS;
      if (slot > now) await sleep(slot - now);
    }
    return originalFetch(input, init);
  };

  const unique = dedupeCompanies(readCompanies(args.file));
  const existingKeys = args.dryRun ? new Set<string>() : await loadExistingKeys(args.year);

  const checkpointPath = path.join('.bulk-progress', `${args.year}-${path.basename(args.file)}.json`);
  const done: Record<string, CompanyAnalysisResult> =
    !args.dryRun && fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf-8')) : {};
  const saveCheckpoint = () => {
    if (args.dryRun) return;
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(done));
  };

  const alreadyRegistered = unique.filter((c) => existingKeys.has(companyKey(c))).length;
  const todo = unique.filter((c) => !existingKeys.has(companyKey(c)) && !done[companyKey(c)]).slice(0, args.limit);
  console.log(
    `[${args.year}년 자료] 파일 ${unique.length}개사 (중복 행 제외) · 이미 등록 ${alreadyRegistered} · 이전 실행에서 완료 ${Object.keys(done).length} · 이번에 조회 ${todo.length}`
  );

  const backend: DartBackend = {
    findCorp: (name, bizNo) => findDartCorp(name, bizNo, apiKey),
    annualReportRating: (corpCode) => checkAnnualReportRating(corpCode, apiKey),
    listBondFilings: (corpCode) => listBondFilings(corpCode, apiKey),
    checkFiling: (rceptNo) => checkFilingForRating(rceptNo, apiKey)
  };

  const failed: { company: CompanyRawData; error: string }[] = [];
  let hitDailyLimit = false;
  let blocked = false;
  let consecutiveNetworkErrors = 0;
  let completed = 0;
  const startedAt = Date.now();
  const stopped = () => hitDailyLimit || blocked;

  await runPool(todo, args.concurrency, async (company) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS_PER_COMPANY && !stopped(); attempt++) {
      try {
        const result = await analyzeCompany(company, backend);
        consecutiveNetworkErrors = 0;
        done[companyKey(company)] = result;
        completed++;
        const elapsed = Date.now() - startedAt;
        const eta = (elapsed / completed) * (todo.length - completed);
        console.log(`[${completed}/${todo.length}] ${company.name} → ${describe(result)}  (남은 시간 약 ${formatDuration(eta)})`);
        if (completed % CHECKPOINT_EVERY === 0) saveCheckpoint();
        return;
      } catch (err) {
        lastError = err;
        if (err instanceof DartApiError && err.status === DART_DAILY_LIMIT_STATUS) {
          hitDailyLimit = true;
          return;
        }
        if (isNetworkError(err)) {
          if (++consecutiveNetworkErrors >= BLOCKED_AFTER_CONSECUTIVE_NETWORK_ERRORS) {
            blocked = true;
            return;
          }
          console.log(`[연결 오류] ${company.name} — ${NETWORK_RETRY_WAIT_MS / 1000}초 후 재시도`);
          await sleep(NETWORK_RETRY_WAIT_MS);
        }
      }
    }
    if (!stopped()) {
      failed.push({ company, error: (lastError as Error)?.message ?? String(lastError) });
      console.log(`[실패] ${company.name}: ${(lastError as Error)?.message}`);
    }
  }, stopped);

  saveCheckpoint();
  const results = Object.values(done);
  const counts = {
    선정: results.filter((r) => r.ratingStatus === 'PASS').length,
    등급미달: results.filter((r) => r.dartSource === 'LIVE_DART' && r.ratingStatus === 'FAIL').length,
    등급미확인: results.filter((r) => r.dartSource === 'ON_DART_NO_RATING').length,
    DART미등록: results.filter((r) => r.dartSource === 'NOT_ON_DART').length
  };
  console.log(`\n소요 ${formatDuration(Date.now() - startedAt)} · DART 요청 ${dartRequests}건 · 결과`, counts, `· 실패 ${failed.length}`);

  if (hitDailyLimit) {
    console.log(`\nDART 일일 요청 한도(2만 건)에 도달했습니다. 진행 상황은 ${checkpointPath}에 저장됐습니다 — 내일 같은 명령을 다시 실행하면 이어서 진행합니다.`);
    process.exitCode = 2;
    return;
  }
  if (blocked) {
    console.log(`\nDART 서버가 연결을 계속 끊고 있습니다(요청이 많아 일시 차단된 것으로 보입니다). 진행 상황은 ${checkpointPath}에 저장됐습니다 — 1~2시간 뒤 같은 명령을 다시 실행하면 이어서 진행합니다.`);
    process.exitCode = BLOCKED_EXIT_CODE;
    return;
  }
  if (args.dryRun) {
    console.log('\n--dry-run: 아무것도 저장하지 않았습니다.');
    return;
  }
  if (results.length === 0 && failed.length === 0) {
    console.log('\n추가할 신규 기업이 없어 업로드 이력을 남기지 않았습니다.');
    return;
  }

  const upload = await saveViaApi({
    adminPassword,
    year: args.year,
    label: args.label,
    results,
    skippedCount: alreadyRegistered,
    failedCount: failed.length
  });
  fs.rmSync(checkpointPath, { force: true });
  console.log(`\n저장 완료: [${upload.year}년 자료] ${upload.label} (${upload.id}) · ${upload.addedCount}개 추가 · ${upload.skippedCount}개 건너뜀 · ${upload.failedCount}개 실패`);
  if (failed.length > 0) {
    console.log('실패한 기업은 저장되지 않았습니다. 같은 파일로 다시 실행하면 이 기업들만 재시도합니다:');
    for (const f of failed) console.log(`  - ${f.company.name} (${f.company.bizNo ?? '사업자번호 없음'}): ${f.error}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
