import type { HansolHub } from '../types';

export const HANSOL_HUBS: HansolHub[] = [
  {
    id: 'shintanjin',
    name: '신탄진 CY',
    type: 'CY',
    address: '대전광역시 대덕구 평촌동 24-3번지',
    lat: 36.4429,
    lng: 127.4202,
    area: '6,000평',
    capacity: '1,300 TEU',
    advantage: '신탄진IC 4km 위치 (경부고속도로 우수한 접근성)',
    phone: '042-934-8050',
    color: '#3b82f6' // Blue
  },
  {
    id: 'uiwang',
    name: '의왕 ICD',
    type: 'ICD',
    address: '경기도 의왕시 오봉로 175 의왕ICD 제2터미널 6군',
    lat: 37.3323,
    lng: 126.9634,
    area: '3,000평 (* 지속 확장 중)',
    capacity: '650 TEU',
    advantage: '오봉역 철도 연계 및 수도권 내륙 컨테이너 기지 핵심 거점',
    phone: '031-462-7332',
    color: '#10b981' // Emerald/Green
  },
  {
    id: 'asan',
    name: '아산 CY',
    type: 'CY',
    address: '충청남도 아산시 탕정면 정정로 212',
    lat: 36.8042,
    lng: 127.0658,
    area: '5,000평',
    capacity: '1,000 TEU',
    advantage: '천안·아산역 인근 위치 (충청/경기 남부 첨단산업단지 인접)',
    phone: '041-548-7332',
    color: '#8b5cf6' // Purple
  },
  {
    id: 'gunsan',
    name: '군산 CY',
    type: 'CY',
    address: '전라북도 군산시 외항안길 313',
    lat: 35.9754,
    lng: 126.6346,
    area: '2,000평',
    capacity: '400 TEU',
    advantage: '군산항 및 서해안권 산업단지 인근 최적 입지',
    phone: '063-467-7332',
    color: '#f59e0b' // Amber/Orange
  }
];
