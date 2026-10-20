import React from 'react';
import type { CompanyAnalysisResult } from '../types';
import { getRatingBadgeStyle } from '../utils/ratingLogic';
import { X, MapPin, Truck, CheckCircle2, XCircle, ShieldCheck, Phone, Info } from 'lucide-react';

interface CompanyDetailModalProps {
  item: CompanyAnalysisResult | null;
  onClose: () => void;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({ item, onClose }) => {
  if (!item) return null;

  const isPass = item.ratingStatus === 'PASS';
  const ratingStyle = item.creditRating
    ? getRatingBadgeStyle(item.creditRating)
    : { bg: 'bg-slate-700/20', text: 'text-slate-400', border: 'border-slate-600/40' };
  const dartStatusLabel =
    item.dartSource === 'LIVE_DART' ? `DART 채무증권 신고서 확인 (${item.ratingSource?.agency ?? ''})` :
    item.dartSource === 'NOT_ON_DART' ? 'DART 미등록 (사업자번호 불일치)' :
    item.dartSource === 'ON_DART_NO_RATING' ? 'DART 등록됨 · 채무증권 신고서에서 등급 미확인' :
    'DART 재무제표 기반 분석';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0 font-bold text-xl">
            {item.company.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-extrabold text-white">{item.company.name}</h2>
              {isPass ? (
                <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 선정 합격 (B등급 이상)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  <XCircle className="w-3.5 h-3.5" /> 미선정 (B등급 미만)
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
              <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span>{item.company.address}</span>
            </p>
            {item.company.phone && (
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span>{item.company.phone}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>DART 신용평가 및 재무지표</span>
            </h3>

            <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <div>
                <span className="text-xs text-slate-400 block">DART 최종 신용등급</span>
                <span className="text-xs text-slate-500">
                  {dartStatusLabel}
                </span>
              </div>
              <span className={`px-4 py-1.5 font-black text-lg rounded-xl border ${ratingStyle.bg} ${ratingStyle.text} ${ratingStyle.border}`}>
                {item.creditRating ?? '미확인'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[11px]">부채비율</span>
                <strong className={item.debtRatio! > 200 ? 'text-amber-400' : 'text-slate-200'}>
                  {item.debtRatio !== undefined ? `${item.debtRatio}%` : '-'}
                </strong>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[11px]">영업이익률</span>
                <strong className={item.operatingMargin! < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {item.operatingMargin !== undefined ? `${item.operatingMargin}%` : '-'}
                </strong>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[11px]">이자보상배율</span>
                <strong className="text-slate-200">
                  {item.interestCoverage !== undefined ? `${item.interestCoverage}배` : '-'}
                </strong>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 block text-[11px]">매출액</span>
                <strong className="text-slate-200">
                  {item.revenue ? `${item.revenue.toLocaleString()}억원` : '-'}
                </strong>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl space-y-3 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>최단 한솔 컨테이너 거점</span>
              </h3>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.nearestHub.color }}></span>
                    <strong className="text-base text-white">{item.nearestHub.name}</strong>
                  </div>
                  <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-300 rounded font-semibold">
                    {item.nearestHub.type}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 font-mono">
                  <span className="text-xl font-bold text-blue-400">{item.distanceKm} km</span>
                  <span className="text-xs text-slate-400">(약 {Math.round(item.distanceKm * 1.25 / 55 * 60)}분 소요)</span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 pt-1 border-t border-slate-800/80">
                  {item.nearestHub.advantage}
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2 pt-2 border-t border-slate-800">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>거점 문의전화: <strong className="text-slate-200">{item.nearestHub.phone}</strong></span>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl space-y-3">
          <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Info className="w-4 h-4 text-purple-400" />
            <span>한솔로지스틱스 4대 거점별 거리 비교</span>
          </h3>

          <div className="space-y-2 text-xs">
            {item.allHubDistances.map((hd, idx) => {
              const isClosest = idx === 0;
              const maxDist = Math.max(...item.allHubDistances.map((h) => h.distanceKm));
              const progressWidth = Math.max(10, Math.round((hd.distanceKm / maxDist) * 100));

              return (
                <div key={hd.hub.id} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hd.hub.color }}></span>
                      <span className={`font-bold ${isClosest ? 'text-white' : 'text-slate-300'}`}>
                        {hd.hub.name} ({hd.hub.type})
                      </span>
                      {isClosest && (
                        <span className="px-2 py-0.2 text-[10px] bg-blue-500/20 text-blue-400 rounded-full font-bold">
                          최단 거점
                        </span>
                      )}
                    </div>

                    <div className="font-mono text-slate-200">
                      <strong>{hd.distanceKm} km</strong> <span className="text-slate-500 text-[11px]">(약 {hd.estimatedDriveTimeMin}분)</span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progressWidth}%`,
                        backgroundColor: hd.hub.color
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
