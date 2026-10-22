import React from 'react';
import type { CompanyAnalysisResult } from '../types';
import { HANSOL_HUBS } from '../constants/hansolHubs';
import { Building2, CheckCircle2, Navigation, PieChart } from 'lucide-react';

interface AnalyticsDashboardProps {
  results: CompanyAnalysisResult[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ results }) => {
  const total = results.length;
  if (total === 0) return null;

  const passedResults = results.filter((r) => r.ratingStatus === 'PASS');
  const passedCount = passedResults.length;
  const passRate = Math.round((passedCount / total) * 100);

  const avgDistance = passedCount > 0
    ? (passedResults.reduce((acc, curr) => acc + curr.distanceKm, 0) / passedCount).toFixed(1)
    : '0';

  const hubDistribution = HANSOL_HUBS.map((hub) => {
    const count = passedResults.filter((r) => r.nearestHub.id === hub.id).length;
    const percentage = passedCount > 0 ? Math.round((count / passedCount) * 100) : 0;
    return {
      hub,
      count,
      percentage
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-400 block">총 업로드 업체 수</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black text-white">{total}</span>
            <span className="text-xs font-semibold text-slate-400">개사</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-400 block">충족 기업 (B등급 이상)</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black text-emerald-400">{passedCount}</span>
            <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {passRate}% 충족률
            </span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 flex-shrink-0">
          <Navigation className="w-6 h-6" />
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-400 block">최단 거점 평균 거리</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black text-purple-300">{avgDistance}</span>
            <span className="text-xs font-semibold text-slate-400">km (약 {Math.round(Number(avgDistance) * 1.25 / 55 * 60)}분)</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <PieChart className="w-3.5 h-3.5 text-blue-400" /> 4대 거점별 배정 비중
          </span>
        </div>
        <div className="space-y-1.5 text-xs">
          {hubDistribution.map((item) => (
            <div key={item.hub.id} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.hub.color }}></span>
                <span className="text-slate-300 truncate">{item.hub.name}</span>
              </div>
              <div className="font-mono text-slate-200">
                <strong>{item.count}</strong> <span className="text-slate-500">({item.percentage}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
