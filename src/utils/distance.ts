import type { HansolHub, HubDistance } from '../types';
import { HANSOL_HUBS } from '../constants/hansolHubs';

/**
 * Calculates geodesic distance between two latitude/longitude points in kilometers using Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Number(distance.toFixed(2));
}

/**
 * Estimate road driving time in minutes based on straight-line distance.
 */
export function estimateDrivingTimeMinutes(straightLineDistanceKm: number): number {
  const roadDistanceKm = straightLineDistanceKm * 1.25;
  const avgSpeedKmH = 55;
  const timeHours = roadDistanceKm / avgSpeedKmH;
  return Math.round(timeHours * 60);
}

/**
 * Compute distances to all 4 Hansol Logistics hubs for a given coordinate.
 */
export function calculateHubDistances(lat: number, lng: number): HubDistance[] {
  const hubDistances: HubDistance[] = HANSOL_HUBS.map((hub) => {
    const distanceKm = calculateHaversineDistance(lat, lng, hub.lat, hub.lng);
    const estimatedDriveTimeMin = estimateDrivingTimeMinutes(distanceKm);
    return {
      hub,
      distanceKm,
      estimatedDriveTimeMin
    };
  });

  return hubDistances.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Get nearest Hansol hub and distance for a location.
 */
export function getNearestHubInfo(lat: number, lng: number): {
  nearestHub: HansolHub;
  distanceKm: number;
  allHubDistances: HubDistance[];
} {
  const sortedDistances = calculateHubDistances(lat, lng);
  return {
    nearestHub: sortedDistances[0].hub,
    distanceKm: sortedDistances[0].distanceKm,
    allHubDistances: sortedDistances
  };
}
