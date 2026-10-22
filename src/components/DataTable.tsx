import React from 'react';
import type { CompanyAnalysisResult } from '../types';
import { getRatingBadgeStyle } from '../utils/ratingLogic';
import { describeRatingSource, ratingBasisDate } from '../utils/ratingSource';
import { CheckCircle2, XCircle, MapPin, Trash2, Info, Building, Truck, Clock, ShieldCheck, ShieldQuestion } from 'lucide-react';

interface DataTableProps {
  results: CompanyAnalysisResult[];
  onSelectCompany: (item: CompanyAnalysisResult) => void;
  onRemoveCompany?: (item: CompanyAnalysisResult) => void; // admin only; no button when absent
  minRatingLabel?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  results,
  onSelectCompany,
  onRemoveCompany
}) => {
  if (results.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 my-6 shadow-xl">
        <Building className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-200">조건에 일치하는 기업 데이터가 없습니다</h3>
        <p className="text-xs text-slate-500 mt-1">
          다른 연도 탭을 선택하거나 필터 조건을 바꿔 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-8">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3.5 px-4 w-12 text-center">NO</th>
              <th className="py-3.5 px-4">선정 상태</th>
              <th className="py-3.5 px-4">기업명</th>
              <th className="py-3.5 px-4">DART 신용등급</th>
              <th className="py-3.5 px-4">전화번호 검증여부</th>
              <th className="py-3.5 px-4">최단 거점</th>
              <th className="py-3.5 px-4">거점 거리 (km)</th>
              <th className="py-3.5 px-4">주소</th>
              <th className="py-3.5 px-4 text-right">상세 / 삭제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {results.map((item, idx) => {
              const isPass = item.ratingStatus === 'PASS';
              const ratingStyle = item.creditRating
                ? getRatingBadgeStyle(item.creditRating)
                : { bg: 'bg-slate-700/20', text: 'text-slate-400', border: 'border-slate-600/40' };
              const exclusionLabel =
                item.dartSource === 'NOT_ON_DART' ? '제외 (DART 미등록)' :
                item.dartSource === 'ON_DART_NO_RATING' ? '제외 (등급 미확인)' :
                '제외 (B미만)';
              // Verified only when DART's own record actually supplied this
              // phone number — being matched on DART isn't enough by itself,
              // since DART can have the company but no phn_no on file.
              const isPhoneVerified = Boolean(item.phoneVerified);

              return (
                <tr
                  key={item.id}
                  className={`hover:bg-slate-800/50 transition-colors group cursor-pointer ${
                    !isPass ? 'bg-rose-950/10' : ''
                  }`}
                  onClick={() => onSelectCompany(item)}
                >
                  <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-semibold">
                    {idx + 1}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isPass ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>선정 (합격)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{exclusionLabel}</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 font-bold text-slate-100 group-hover:text-blue-400 transition-colors whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>{item.company.name}</span>
                    </div>
                    {item.company.bizNo && (
                      <span className="block text-[10px] font-mono text-slate-500 font-normal">
                        사업자: {item.company.bizNo}
                      </span>
                    )}
                    {item.company.phone && (
                      <span className="block text-[10px] font-mono text-slate-500 font-normal">
                        전화: {item.company.phone}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`inline-block px-3 py-1 font-extrabold rounded-lg text-xs border ${ratingStyle.bg} ${ratingStyle.text} ${ratingStyle.border}`}
                    >
                      {item.creditRating ?? '미확인'}
                    </span>
                    {item.ratingSource && (
                      <span className="block text-[10px] text-slate-500 mt-1" title={describeRatingSource(item.ratingSource)}>
                        {ratingBasisDate(item.ratingSource)} 기준
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {!item.company.phone ? (
                      <span className="text-slate-500 text-xs">-</span>
                    ) : isPhoneVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3" /> 확인됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <ShieldQuestion className="w-3 h-3" /> 확인필요
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.nearestHub.color }}
                      ></span>
                      <div>
                        <span className="font-bold text-slate-100">{item.nearestHub.name}</span>
                        <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                          {item.nearestHub.type}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                    <div className="font-bold text-blue-400 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" />
                      <span>{item.distanceKm} km</span>
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>약 {Math.round(item.distanceKm * 1.25 / 55 * 60)}분</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate" title={item.company.address}>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{item.company.address}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onSelectCompany(item)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="상세 재무/거점분석 정보 보기"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      {onRemoveCompany && (
                        <button
                          onClick={() => onRemoveCompany(item)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="공유 목록에서 기업 삭제 (관리자)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
