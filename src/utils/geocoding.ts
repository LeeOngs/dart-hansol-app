export interface Coordinates {
  lat: number;
  lng: number;
}

// Built-in Geocoding Dictionary for Korean Cities, Districts, Industrial Parks, and Landmarks
const KOREA_ADDRESS_COORDS: Record<string, Coordinates> = {
  // 서울 주요 지역
  '서울': { lat: 37.5665, lng: 126.9780 },
  '강남': { lat: 37.4979, lng: 127.0276 },
  '구로': { lat: 37.4852, lng: 126.9015 },
  '성수': { lat: 37.5446, lng: 127.0559 },
  '마포': { lat: 37.5563, lng: 126.9229 },
  '영등포': { lat: 37.5264, lng: 126.8962 },
  '송파': { lat: 37.5145, lng: 127.1059 },

  // 경기도 주요 도시 및 공단
  '의왕': { lat: 37.3448, lng: 126.9684 },
  '수원': { lat: 37.2636, lng: 127.0286 },
  '화성': { lat: 37.1995, lng: 126.8313 },
  '평택': { lat: 36.9921, lng: 127.0858 },
  '용인': { lat: 37.2411, lng: 127.1776 },
  '성남': { lat: 37.4200, lng: 127.1265 },
  '판교': { lat: 37.4020, lng: 127.1086 },
  '안산': { lat: 37.3219, lng: 126.8309 },
  '시흥': { lat: 37.3802, lng: 126.8029 },
  '이천': { lat: 37.2723, lng: 127.4348 },
  '김포': { lat: 37.6153, lng: 126.7155 },
  '파주': { lat: 37.7595, lng: 126.7799 },

  // 충청권
  '천안': { lat: 36.8151, lng: 127.1139 },
  '아산': { lat: 36.7898, lng: 127.0019 },
  '탕정': { lat: 36.8042, lng: 127.0658 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '신탄진': { lat: 36.4429, lng: 127.4202 },
  '대덕': { lat: 36.4000, lng: 127.4100 },
  '청주': { lat: 36.6424, lng: 127.4890 },
  '세종': { lat: 36.4800, lng: 127.2890 },
  '충주': { lat: 36.9910, lng: 127.9260 },
  '서산': { lat: 36.7844, lng: 126.4503 },
  '당진': { lat: 36.8898, lng: 126.6459 },

  // 호남권
  '군산': { lat: 35.9754, lng: 126.6346 },
  '익산': { lat: 35.9483, lng: 126.9578 },
  '전주': { lat: 35.8242, lng: 127.1480 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '여수': { lat: 34.7604, lng: 127.6622 },
  '광양': { lat: 34.9407, lng: 127.6959 },
  '목포': { lat: 34.8118, lng: 126.3922 },

  // 영남권 및 기타
  '부산': { lat: 35.1796, lng: 129.0756 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '구미': { lat: 36.1195, lng: 128.3445 },
  '포항': { lat: 36.0190, lng: 129.3435 },
  '창원': { lat: 35.2280, lng: 128.6811 },
  '김해': { lat: 35.2342, lng: 128.8812 },
  '거제': { lat: 34.8806, lng: 128.6211 },

  // 인천 / 강원
  '인천': { lat: 37.4563, lng: 126.7052 },
  '송도': { lat: 37.3842, lng: 126.6432 },
  '원주': { lat: 37.3422, lng: 127.9201 },
  '동해': { lat: 37.5247, lng: 129.1143 }
};

/**
 * Geocode a Korean address string into lat/lng coordinates.
 * Returns exact/matched coords or calculated pseudo-hash offset for unique map placement.
 */
export function geocodeAddress(address: string): Coordinates {
  if (!address) {
    return { lat: 37.5665, lng: 126.9780 }; // Default Seoul
  }

  const cleanAddr = address.trim();

  // Check exact key or substring match
  for (const [key, coords] of Object.entries(KOREA_ADDRESS_COORDS)) {
    if (cleanAddr.includes(key)) {
      // Add slight deterministic jitter based on address string hash to prevent overlapping markers on map
      const hash = simpleHash(cleanAddr);
      const jitterLat = ((hash % 100) - 50) * 0.0003;
      const jitterLng = (((hash / 100) % 100) - 50) * 0.0003;
      return {
        lat: Number((coords.lat + jitterLat).toFixed(5)),
        lng: Number((coords.lng + jitterLng).toFixed(5))
      };
    }
  }

  // Fallback default: Gyeonggi/Seoul center + hash offset
  const hash = simpleHash(cleanAddr);
  const fallbackLat = 36.8 + ((hash % 150) / 100);
  const fallbackLng = 127.0 + (((hash / 150) % 150) / 100);

  return {
    lat: Number(fallbackLat.toFixed(5)),
    lng: Number(fallbackLng.toFixed(5))
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
