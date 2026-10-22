import React from 'react';
import { Search, Filter, ArrowUpDown, FileSpreadsheet, CheckCircle2, XCircle, Layers, ShieldCheck } from 'lucide-react';
import type { CreditRating, SortField, SortOrder } from '../types';
import { HANSOL_HUBS } from '../constants/hansolHubs';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: 'ALL' | 'PASS' | 'FAIL';
  onStatusFilterChange: (status: 'ALL' | 'PASS' | 'FAIL') => void;
  selectedHubId: string;
  onHubFilterChange: (hubId: string) => void;
  minRatingFilter: CreditRating | 'ALL';
  onMinRatingChange: (minRating: CreditRating | 'ALL') => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  onExportExcel: () => void;
  passedCount: number;
  failedCount: number;
  totalCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedHubId,
  onHubFilterChange,
  minRatingFilter,
  onMinRatingChange,
  sortField,
  sortOrder,
  onSortChange,
  onExportExcel,
  passedCount,
  failedCount,
  totalCount
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl mb-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto">
          <button
            onClick={() => onStatusFilterChange('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>전체 기업 ({totalCount})</span>
          </button>

          <button
            onClick={() => onStatusFilterChange('PASS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'PASS'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>충족: B등급 이상 ({passedCount})</span>
          </button>

          <button
            onClick={() => onStatusFilterChange('FAIL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'FAIL'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-rose-400 hover:bg-rose-500/10'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>제외: B등급 미만 ({failedCount})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="기업명, 주소, 업종 검색..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-all"
            />
          </div>

          <button
            onClick={onExportExcel}
            className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/15 transition-all flex items-center gap-1.5 flex-shrink-0"
            title="필터링된 분석 결과를 엑셀 파일로 추출합니다"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>엑셀 결과 내보내기</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 font-semibold mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" /> 거점 분류:
          </span>
          <button
            onClick={() => onHubFilterChange('ALL')}
            className={`px-2.5 py-1 rounded-lg border transition-all ${
              selectedHubId === 'ALL'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 font-bold'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            전체 4대 거점
          </button>

          {HANSOL_HUBS.map((hub) => (
            <button
              key={hub.id}
              onClick={() => onHubFilterChange(hub.id)}
              className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                selectedHubId === hub.id
                  ? 'bg-slate-800 text-white font-bold border-slate-600 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hub.color }}></span>
              <span>{hub.name}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> 최소 신용등급:
            </span>
            <select
              value={minRatingFilter}
              onChange={(e) => onMinRatingChange(e.target.value as CreditRating | 'ALL')}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-semibold text-slate-200 focus:border-blue-500 cursor-pointer"
            >
              <option value="B-">B- 등급 이상 (기본값)</option>
              <option value="B">B 등급 이상</option>
              <option value="BBB-">BBB- 등급 이상 (투자적격)</option>
              <option value="A-">A- 등급 이상 (우수)</option>
              <option value="ALL">제한 없음 (전체 등급)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-') as [SortField, SortOrder];
                onSortChange(field, order);
              }}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-semibold text-slate-200 focus:border-blue-500 cursor-pointer"
            >
              <option value="distanceKm-asc">거점 거리 가까운 순 (최단거리)</option>
              <option value="distanceKm-desc">거점 거리 먼 순</option>
              <option value="creditRating-asc">신용등급 높은 순 (AAA 우선)</option>
              <option value="creditRating-desc">신용등급 낮은 순</option>
              <option value="name-asc">기업명 가나다 순</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
