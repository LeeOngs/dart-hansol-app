import { useState, useEffect, useMemo } from 'react';
import type { CompanyRawData, CompanyAnalysisResult, CreditRating, SortField, SortOrder, StoredCompanyResult, UploadBatch } from './types';
import { isRatingAtLeast, getRatingRank } from './utils/ratingLogic';
import { exportResultsToExcel } from './utils/excelUtils';
import { analyzeCompanies } from './services/clientDartAnalysis';
import type { AnalysisProgress } from './services/clientDartAnalysis';
import { companyKey, currentYear, dedupeCompanies, hydrate, isValidDatasetYear, yearsFromUploads } from './services/companyStore';

import { Navbar } from './components/Navbar';
import { AdminLoginModal } from './components/AdminLoginModal';
import { DataUploader } from './components/DataUploader';
import { UploadHistoryPanel } from './components/UploadHistoryPanel';
import { YearTabs } from './components/YearTabs';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { FilterBar } from './components/FilterBar';
import { DataTable } from './components/DataTable';
import { CompanyDetailModal } from './components/CompanyDetailModal';
import { Sparkles, Info, AlertTriangle, Building2 } from 'lucide-react';

const ADMIN_PASSWORD_STORAGE_KEY = 'admin_password';

// The browser has to stay open while it drives the analysis, so very large
// lists go through the local bulk script (scripts/bulk-upload.ts) instead.
const MAX_NEW_COMPANIES_PER_WEB_UPLOAD = 300;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchYearCompanies(year: string): Promise<CompanyAnalysisResult[]> {
  const all: CompanyAnalysisResult[] = [];
  let cursor = '0';
  do {
    const page = await fetchJson<{ companies: StoredCompanyResult[]; cursor: string }>(`/api/companies?year=${year}&cursor=${cursor}`);
    all.push(...page.companies.map(hydrate));
    cursor = page.cursor;
  } while (cursor !== '0');
  return all;
}

export function App() {
  const [adminPassword, setAdminPassword] = useState<string>(() => localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || '');
  const isAdmin = adminPassword.length > 0;
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Dataset years that have data — public. The upload log itself is admin-only.
  const [savedYears, setSavedYears] = useState<string[]>([]);
  const [adminUploads, setUploads] = useState<UploadBatch[]>([]);
  const uploads = useMemo(() => (isAdmin ? adminUploads : []), [isAdmin, adminUploads]);
  // Each dataset year is its own cumulative list; only the selected one is loaded.
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  // Years the admin opened in this session that have no upload yet.
  const [newYears, setNewYears] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyAnalysisResult[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // null = the whole cumulative list; otherwise only what that upload added.
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<AnalysisProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASS' | 'FAIL'>('ALL');
  const [selectedHubId, setSelectedHubId] = useState<string>('ALL');
  const [minRatingFilter, setMinRatingFilter] = useState<CreditRating | 'ALL'>('B-');
  const [sortField, setSortField] = useState<SortField>('distanceKm');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [selectedCompany, setSelectedCompany] = useState<CompanyAnalysisResult | null>(null);

  const years = useMemo(() => {
    const all = [...new Set([...savedYears, ...yearsFromUploads(uploads), ...newYears])].sort((a, b) => b.localeCompare(a));
    return all.length > 0 ? all : [currentYear()];
  }, [savedYears, uploads, newYears]);

  // The shared lists live on the server — every viewer loads the same data.
  // The year list comes first; it decides which year opens by default (the latest).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchJson<{ years: string[] }>('/api/uploads');
        if (cancelled) return;
        const loaded = Array.isArray(data.years) ? data.years : [];
        setSavedYears(loaded);
        setSelectedYear(loaded[0] ?? currentYear());
      } catch {
        if (!cancelled) {
          setHistoryError('자료 연도 목록을 불러오지 못했습니다. 새로고침해 주세요.');
          setIsLoadingHistory(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The upload log is only fetched (and only served) for the admin.
  useEffect(() => {
    if (!adminPassword) return;
    let cancelled = false;

    (async () => {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword })
      });
      if (cancelled) return;
      if (res.status === 401) {
        // Stored password no longer valid — drop admin mode.
        setAdminPassword('');
        localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) setUploads(Array.isArray(data.uploads) ? data.uploads : []);
    })().catch(() => {
      if (!cancelled) setUploadError('업로드 이력을 불러오지 못했습니다. 새로고침해 주세요.');
    });

    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  useEffect(() => {
    if (!selectedYear) return;
    let cancelled = false;

    (async () => {
      setIsLoadingHistory(true);
      setHistoryError(null);
      setAllCompanies([]);
      setActiveUploadId(null);
      setHiddenIds(new Set());
      try {
        const companies = await fetchYearCompanies(selectedYear);
        if (!cancelled) setAllCompanies(companies);
      } catch {
        if (!cancelled) setHistoryError(`${selectedYear}년 기업 목록을 불러오지 못했습니다. 새로고침해 주세요.`);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  const handleAddYear = () => {
    const input = prompt('새로 등록할 자료 연도를 입력하세요 (예: 2027)', String(Number(years[0]) + 1));
    if (input === null) return;
    const year = input.trim();
    if (!isValidDatasetYear(year)) {
      alert('연도는 2025처럼 4자리 숫자로 입력해 주세요.');
      return;
    }
    if (!years.includes(year)) setNewYears((prev) => [...prev, year]);
    setSelectedYear(year);
  };

  // Filtering by upload batch is an admin view; visitors always see the whole year.
  const effectiveUploadId = isAdmin ? activeUploadId : null;
  const analysisResults = useMemo(
    () => allCompanies.filter((r) => !hiddenIds.has(r.id) && (effectiveUploadId === null || r.uploadId === effectiveUploadId)),
    [allCompanies, hiddenIds, effectiveUploadId]
  );

  // Shared submit path for file upload / manual add / sample load. Companies
  // already in the shared list are skipped (not re-queried); only new ones
  // are analyzed against DART and added for every viewer.
  const submitUpload = async (companies: CompanyRawData[], label?: string) => {
    if (!isAdmin) {
      alert('관리자 모드로 로그인해야 업로드할 수 있습니다.');
      return;
    }

    if (isUploading || isLoadingHistory || !selectedYear) return;
    const year = selectedYear;
    setUploadError(null);
    setUploadNotice(null);

    const unique = dedupeCompanies(companies);
    const existingKeys = new Set(allCompanies.map((r) => companyKey(r.company)));
    const newCompanies = unique.filter((c) => !existingKeys.has(companyKey(c)));
    const skippedCount = unique.length - newCompanies.length;

    if (newCompanies.length === 0) {
      setUploadNotice(`${unique.length}개 기업이 모두 ${year}년 자료에 이미 등록되어 있어 추가할 기업이 없습니다.`);
      return;
    }
    if (newCompanies.length > MAX_NEW_COMPANIES_PER_WEB_UPLOAD) {
      setUploadError(
        `신규 기업이 ${newCompanies.length}개입니다. 웹에서는 한 번에 ${MAX_NEW_COMPANIES_PER_WEB_UPLOAD}개까지 처리할 수 있으니, 파일을 나눠 올리거나 PC에서 일괄 등록 스크립트(scripts/bulk-upload.ts)를 사용해 주세요.`
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);
    try {
      const { results, failed } = await analyzeCompanies(newCompanies, adminPassword, setUploadProgress);

      const res = await fetch('/api/upload-finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, year, label, results, skippedCount, failedCount: failed.length })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(data.error || '저장에 실패했습니다.'), { status: res.status });
      }

      const upload: UploadBatch = data.upload;
      const added = (data.added as StoredCompanyResult[]).map(hydrate);
      setUploads((prev) => [upload, ...prev]);
      setAllCompanies((prev) => [...prev, ...added]);
      setActiveUploadId(upload.id);

      const summary = `${year}년 자료에 ${upload.addedCount}개 추가 · ${upload.skippedCount}개 이미 등록되어 건너뜀`;
      if (failed.length > 0) {
        const names = failed.slice(0, 10).map((f) => f.company.name).join(', ');
        setUploadError(
          `${summary} · ${failed.length}개 조회 실패 (저장 안 됨 — 같은 파일을 다시 올리면 실패한 기업만 재시도합니다): ${names}${failed.length > 10 ? ' 외' : ''}`
        );
      } else {
        setUploadNotice(summary);
      }
    } catch (err) {
      setUploadError((err as Error).message || '업로드에 실패했습니다.');
      if ((err as { status?: number }).status === 401) {
        // Stored password no longer valid — drop admin mode.
        setAdminPassword('');
        localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDataLoaded = (companies: CompanyRawData[], uploadLabel?: string) => submitUpload(companies, uploadLabel);
  const handleAddManualCompany = (company: CompanyRawData) => submitUpload([company]);

  // Removing a row only hides it from the current view — it does not touch
  // the shared list, since other viewers rely on that staying intact.
  const handleRemoveCompany = (id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
  };

  const handleAdminLoginSuccess = (password: string) => {
    setAdminPassword(password);
    localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
  };

  const filteredAndSortedResults = useMemo(() => {
    return analysisResults
      .filter((item) => {
        if (minRatingFilter !== 'ALL') {
          if (!item.creditRating || !isRatingAtLeast(item.creditRating, minRatingFilter as CreditRating)) {
            return false;
          }
        }

        if (statusFilter === 'PASS' && item.ratingStatus !== 'PASS') return false;
        if (statusFilter === 'FAIL' && item.ratingStatus !== 'FAIL') return false;

        if (selectedHubId !== 'ALL' && item.nearestHub.id !== selectedHubId) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = item.company.name.toLowerCase().includes(q);
          const matchAddr = item.company.address.toLowerCase().includes(q);
          const matchIndustry = (item.company.industry || '').toLowerCase().includes(q);
          if (!matchName && !matchAddr && !matchIndustry) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === 'distanceKm') {
          comp = a.distanceKm - b.distanceKm;
        } else if (sortField === 'creditRating') {
          const rankA = a.creditRating ? getRatingRank(a.creditRating) : Number.MAX_SAFE_INTEGER;
          const rankB = b.creditRating ? getRatingRank(b.creditRating) : Number.MAX_SAFE_INTEGER;
          comp = rankA - rankB;
        } else if (sortField === 'name') {
          comp = a.company.name.localeCompare(b.company.name, 'ko');
        } else if (sortField === 'nearestHub') {
          comp = a.nearestHub.name.localeCompare(b.nearestHub.name, 'ko');
        }

        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [analysisResults, searchQuery, statusFilter, selectedHubId, minRatingFilter, sortField, sortOrder]);

  const passedCount = useMemo(() => {
    return analysisResults.filter((r) => r.ratingStatus === 'PASS').length;
  }, [analysisResults]);

  const failedCount = useMemo(() => {
    return analysisResults.filter((r) => r.ratingStatus === 'FAIL').length;
  }, [analysisResults]);

  const handleExportExcel = () => {
    exportResultsToExcel(filteredAndSortedResults, `한솔로지스틱스_거점별_선정기업_리스트_${selectedYear}년.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-800 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      <Navbar
        isAdmin={isAdmin}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        passedCount={passedCount}
        totalCount={analysisResults.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {historyError && (
          <div className="p-4 mb-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{historyError}</p>
          </div>
        )}

        {uploadError && (
          <div className="p-4 mb-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{uploadError}</p>
          </div>
        )}

        {uploadNotice && (
          <div className="p-4 mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-3 text-emerald-300 text-sm">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{uploadNotice}</p>
          </div>
        )}

        <YearTabs
          years={years}
          selectedYear={selectedYear}
          onSelect={setSelectedYear}
          onAddYear={isAdmin ? handleAddYear : undefined}
          disabled={isUploading}
        />

        {isAdmin && selectedYear && (
          <DataUploader
            onDataLoaded={handleDataLoaded}
            onAddManualCompany={handleAddManualCompany}
            currentCount={analysisResults.length}
            targetYear={selectedYear}
          />
        )}

        {isAdmin && (
          <UploadHistoryPanel
            uploads={uploads.filter((u) => u.year === selectedYear)}
            totalCount={allCompanies.length}
            activeUploadId={activeUploadId}
            onSelect={setActiveUploadId}
          />
        )}

        {isLoadingHistory && (
          <div className="p-4 mb-6 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center gap-3 text-blue-400 text-sm animate-pulse">
            <Sparkles className="w-5 h-5 animate-spin" />
            <span>공유 기업 목록을 불러오는 중...</span>
          </div>
        )}

        {isUploading && (
          <div className="p-4 mb-6 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-blue-300 text-sm">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 animate-spin flex-shrink-0" />
              <span className="font-semibold">
                {uploadProgress
                  ? `DART 분석 중... (${uploadProgress.doneCount}/${uploadProgress.total} 완료) ${uploadProgress.currentName}`
                  : 'DART 분석 준비 중...'}
              </span>
            </div>
            {uploadProgress && (
              <>
                <p className="text-xs text-blue-400/80 mt-1 ml-8">{uploadProgress.step}</p>
                <div className="w-full bg-slate-900 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${Math.round((uploadProgress.doneCount / uploadProgress.total) * 100)}%` }}
                  />
                </div>
              </>
            )}
            <p className="text-xs text-slate-400 mt-2">
              DART가 공시서류 다운로드 속도를 제한해서 신용등급이 있는 회사는 건당 30초~수 분이 걸립니다. 이 탭을 닫지 마세요. 완료되면 모든 방문자에게 공유됩니다.
            </p>
          </div>
        )}

        {!isLoadingHistory && !historyError && allCompanies.length === 0 && (
          <div className="p-6 mb-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p className="text-sm">{selectedYear}년 자료로 업로드된 데이터가 없습니다.</p>
            <p className="text-xs text-slate-500 mt-1">관리자가 데이터를 업로드하면 여기에 표시됩니다.</p>
          </div>
        )}

        <AnalyticsDashboard results={analysisResults} />

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedHubId={selectedHubId}
          onHubFilterChange={setSelectedHubId}
          minRatingFilter={minRatingFilter}
          onMinRatingChange={setMinRatingFilter}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(field, order) => {
            setSortField(field);
            setSortOrder(order);
          }}
          onExportExcel={handleExportExcel}
          passedCount={passedCount}
          failedCount={failedCount}
          totalCount={analysisResults.length}
        />

        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-slate-200">
            데이터 리스트 ({filteredAndSortedResults.length}개)
          </h2>

          <div className="text-xs text-slate-400 hidden sm:flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span>신용도 B등급 이상 업체만 자동 선별되어 최단 거점순 정렬됩니다.</span>
          </div>
        </div>

        <DataTable
          results={filteredAndSortedResults}
          onSelectCompany={(item) => setSelectedCompany(item)}
          onRemoveCompany={handleRemoveCompany}
        />
      </main>

      <footer className="bg-slate-800 border-t border-slate-700 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div>
            <strong>한솔로지스틱스 (Hansol Logistics)</strong> 컨테이너운송 사업 연계 시스템 • DART 전자공시 API 연동
          </div>
          <div className="text-slate-600">
            4대 거점: 신탄진 CY (대전) • 의왕 ICD (경기) • 아산 CY (충남) • 군산 CY (전북)
          </div>
        </div>
      </footer>

      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onLoginSuccess={handleAdminLoginSuccess}
      />

      <CompanyDetailModal
        item={selectedCompany}
        onClose={() => setSelectedCompany(null)}
      />
    </div>
  );
}

export default App;
