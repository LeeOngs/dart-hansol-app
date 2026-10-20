import { useState, useEffect, useMemo, useRef } from 'react';
import type { CompanyRawData, CompanyAnalysisResult, CreditRating, SortField, SortOrder, UploadHistoryEntry } from './types';
import { SAMPLE_COMPANIES } from './constants/sampleCompanies';
import { analyzeCompanyWithDart, getStoredDartApiKey, isValidDartApiKey } from './services/dartApi';
import { isRatingAtLeast, getRatingRank } from './utils/ratingLogic';
import { exportResultsToExcel } from './utils/excelUtils';
import { loadUploadHistory, addUploadHistoryEntry, defaultUploadLabel, reserveNextUploadId } from './services/uploadHistoryStore';
import type { UploadIdReservation } from './services/uploadHistoryStore';

import { Navbar } from './components/Navbar';
import { ApiKeyModal } from './components/ApiKeyModal';
import { DataUploader } from './components/DataUploader';
import { UploadHistoryPanel } from './components/UploadHistoryPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { FilterBar } from './components/FilterBar';
import { DataTable } from './components/DataTable';
import { CompanyDetailModal } from './components/CompanyDetailModal';
import { Sparkles, Info, ShieldAlert } from 'lucide-react';

const NO_API_KEY_WARNING =
  'DART API 키가 등록되어 있지 않습니다.\n상단의 "DART API Key 설정"에서 키를 먼저 등록해주세요.\n키 없이는 분석을 진행할 수 없습니다 (임의 데이터를 생성하지 않습니다).';

export function App() {
  const [apiKey, setApiKey] = useState<string>(getStoredDartApiKey());
  const isApiKeyValid = isValidDartApiKey(apiKey);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const [rawCompanies, setRawCompanies] = useState<CompanyRawData[]>(SAMPLE_COMPANIES);
  const [analysisResults, setAnalysisResults] = useState<CompanyAnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [uploadHistory, setUploadHistory] = useState<UploadHistoryEntry[]>(() => loadUploadHistory());
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  // Set right before a history entry is restored, so the analysis effect
  // below knows to skip re-running DART lookups for data we already have.
  const skipAutoAnalyzeRef = useRef(false);
  // Keyed by the exact rawCompanies array reference for a given upload, so
  // two uploads analyzing concurrently (e.g. a second file dropped before the
  // first's real DART lookups finish) can never read or clear each other's
  // pending id/label — each analysis run only ever looks up its own entry.
  const pendingUploadsRef = useRef(new WeakMap<CompanyRawData[], { id: string; label: string }>());
  // Running id-sequence reservation, advanced synchronously at upload time
  // (not read lazily from history at save time) so concurrent uploads never
  // collide on the same id.
  const uploadIdReservationRef = useRef<UploadIdReservation | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASS' | 'FAIL'>('ALL');
  const [selectedHubId, setSelectedHubId] = useState<string>('ALL');
  const [minRatingFilter, setMinRatingFilter] = useState<CreditRating | 'ALL'>('B-');
  const [sortField, setSortField] = useState<SortField>('distanceKm');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [selectedCompany, setSelectedCompany] = useState<CompanyAnalysisResult | null>(null);

  useEffect(() => {
    if (skipAutoAnalyzeRef.current) {
      skipAutoAnalyzeRef.current = false;
      return;
    }

    // Never fabricate analysis data. Without a valid key, leave results
    // empty and let the persistent warning banner (below) explain why.
    if (!isValidDartApiKey(apiKey)) {
      setAnalysisResults([]);
      setIsAnalyzing(false);
      return;
    }

    let isMounted = true;

    async function runAnalysis() {
      setIsAnalyzing(true);
      const results: CompanyAnalysisResult[] = [];

      for (const comp of rawCompanies) {
        const res = await analyzeCompanyWithDart(comp, apiKey);
        results.push(res);
      }

      if (isMounted) {
        setAnalysisResults(results);
        setIsAnalyzing(false);

        const pending = pendingUploadsRef.current.get(rawCompanies);
        if (pending) {
          pendingUploadsRef.current.delete(rawCompanies);
          // Functional update: two uploads' analyses can finish around the
          // same time, and each must layer onto whatever the other just
          // saved rather than overwriting it with a stale snapshot.
          setUploadHistory((prev) =>
            addUploadHistoryEntry(prev, {
              id: pending.id,
              label: pending.label,
              rawCompanies,
              analysisResults: results
            }).history
          );
          setActiveHistoryId(pending.id);
        }
      }
    }

    runAnalysis();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCompanies, apiKey]);

  const handleDataLoaded = (companies: CompanyRawData[], uploadLabel?: string) => {
    if (!isApiKeyValid) {
      alert(NO_API_KEY_WARNING);
      return;
    }
    // Reserve the id synchronously, right now — not later when analysis
    // finishes — so a second upload started before this one's (possibly
    // slow, real-DART) analysis completes always gets a distinct id.
    const { id, reservation } = reserveNextUploadId(uploadIdReservationRef.current, uploadHistory);
    uploadIdReservationRef.current = reservation;
    pendingUploadsRef.current.set(companies, { id, label: uploadLabel || defaultUploadLabel() });
    setRawCompanies(companies);
  };

  const handleSelectHistoryEntry = (entry: UploadHistoryEntry) => {
    skipAutoAnalyzeRef.current = true;
    setRawCompanies(entry.rawCompanies);
    setAnalysisResults(entry.analysisResults);
    setActiveHistoryId(entry.id);
  };

  const handleAddManualCompany = (company: CompanyRawData) => {
    if (!isApiKeyValid) {
      alert(NO_API_KEY_WARNING);
      return;
    }
    setRawCompanies((prev) => [company, ...prev]);
  };

  const handleReloadSamples = () => {
    if (!isApiKeyValid) {
      alert(NO_API_KEY_WARNING);
      return;
    }
    setActiveHistoryId(null);
    setRawCompanies(SAMPLE_COMPANIES);
  };

  const handleRemoveCompany = (id: string) => {
    setRawCompanies((prev) => prev.filter((c) => c.id !== id));
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
    exportResultsToExcel(filteredAndSortedResults);
  };

  return (
    <div className="min-h-screen bg-slate-800 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      <Navbar
        apiKey={apiKey}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onReloadSamples={handleReloadSamples}
        passedCount={passedCount}
        totalCount={analysisResults.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {!isApiKeyValid && (
          <div className="p-4 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-300 text-sm">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">DART API 키가 등록되어 있지 않습니다.</p>
              <p className="text-amber-400/80 text-xs mt-0.5">
                키 없이는 분석을 진행할 수 없습니다 (임의 데이터를 생성하지 않습니다). 상단의 "DART API Key 설정"에서 키를 먼저 등록해주세요.
              </p>
            </div>
          </div>
        )}

        <DataUploader
          onDataLoaded={handleDataLoaded}
          onAddManualCompany={handleAddManualCompany}
          onLoadSamples={handleReloadSamples}
          currentCount={rawCompanies.length}
        />

        <UploadHistoryPanel
          history={uploadHistory}
          activeHistoryId={activeHistoryId}
          onSelect={handleSelectHistoryEntry}
        />

        {isAnalyzing && (
          <div className="p-4 mb-6 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center gap-3 text-blue-400 text-sm animate-pulse">
            <Sparkles className="w-5 h-5 animate-spin" />
            <span>DART 전자공시 API 연동 및 한솔 4대 거점 최단 거리 산출 분석 중...</span>
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

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        currentApiKey={apiKey}
        onSave={(newKey) => setApiKey(newKey)}
      />

      <CompanyDetailModal
        item={selectedCompany}
        onClose={() => setSelectedCompany(null)}
      />
    </div>
  );
}

export default App;
