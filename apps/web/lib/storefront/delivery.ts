import type { DeliveryServiceOption, DELIVERY_SERVICE_OPTIONS } from '@/lib/types';

// Store location (Taunton, MA) - configure via env or DB
const STORE_LAT = parseFloat(process.env.STORE_LATITUDE || '42.3601');
const STORE_LNG = parseFloat(process.env.STORE_LONGITUDE || '-71.0589');
export const STORE_LOCATION: [number, number] = [STORE_LNG, STORE_LAT];

// Delivery fee configuration
interface DeliveryFeeConfig {
  baseFee: number;
  perMileRate: number;
  freeRadiusMiles: number;
  maxDeliveryMiles: number;
  serviceFees: Record<string, number>;
}

const DEFAULT_DELIVERY_CONFIG: DeliveryFeeConfig = {
  baseFee: 25,
  perMileRate: 1.50,
  freeRadiusMiles: 15,
  maxDeliveryMiles: 75,
  serviceFees: {
    pallet_jack: 25,
    lift_gate: 50,
    forklift: 75,
    garage_placement: 25,
  },
};

export interface DeliveryFeeBreakdown {
  subtotal: number;
  distanceMiles: number;
  distanceFee: number;
  serviceFees: number;
  total: number;
  isOutOfRange: boolean;
  outOfRangeMessage?: string;
}

export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  
  if (!mapboxToken) {
    console.error('[Delivery] Mapbox token not configured');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      console.error('[Delivery] No geocoding results for address:', address);
      return null;
    }

    const [lng, lat] = data.features[0].center;
    return [lng, lat];
  } catch (error) {
    console.error('[Delivery] Geocoding error:', error);
    return null;
  }
}

export async function calculateDistance(
  origin: [number, number],
  destination: [number, number]
): Promise<number | null> {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  
  if (!mapboxToken) {
    console.error('[Delivery] Mapbox token not configured');
    return null;
  }

  try {
    const originStr = `${origin[0]},${origin[1]}`;
    const destStr = `${destination[0]},${destination[1]}`;
    const url = `https://api.mapbox.com/directions-matrix/v2/mapbox/driving/${originStr};${destStr}?access_token=${mapboxToken}&sources=0&destinations=1&annotations=distance`;

    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('[Delivery] Distance matrix API error:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.distances || data.distances.length === 0) {
      console.error('[Delivery] No distance data returned');
      return null;
    }

    const distanceMeters = data.distances[0][0];
    return distanceMeters / 1609.344;
  } catch (error) {
    console.error('[Delivery] Distance calculation error:', error);
    return null;
  }
}

export function calculateDeliveryFee(
  distanceMiles: number,
  selectedServices: string[],
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_CONFIG
): DeliveryFeeBreakdown {
  if (distanceMiles > config.maxDeliveryMiles) {
    return {
      subtotal: 0,
      distanceMiles,
      distanceFee: 0,
      serviceFees: 0,
      total: 0,
      isOutOfRange: true,
      outOfRangeMessage: `We only deliver within ${config.maxDeliveryMiles} miles.`,
    };
  }

  let distanceFee = 0;
  if (distanceMiles > config.freeRadiusMiles) {
    const billableMiles = distanceMiles - config.freeRadiusMiles;
    distanceFee = config.baseFee + (billableMiles * config.perMileRate);
  }

  const serviceFees = selectedServices.reduce((total, service) => {
    return total + (config.serviceFees[service] || 0);
  }, 0);

  const subtotal = distanceFee;
  const total = subtotal + serviceFees;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    distanceMiles: Math.round(distanceMiles * 10) / 10,
    distanceFee: Math.round(distanceFee * 100) / 100,
    serviceFees: Math.round(serviceFees * 100) / 100,
    total: Math.round(total * 100) / 100,
    isOutOfRange: false,
  };
}

export async function getDeliveryQuote(
  address: string,
  selectedServices: string[] = [],
  config: DeliveryFeeConfig = DEFAULT_DELIVERY_CONFIG
): Promise<DeliveryFeeBreakdown> {
  const customerCoords = await geocodeAddress(address);
  
  if (!customerCoords) {
    return {
      subtotal: 0,
      distanceMiles: 0,
      distanceFee: 0,
      serviceFees: 0,
      total: 0,
      isOutOfRange: true,
      outOfRangeMessage: 'Unable to verify your address. Please check for typos.',
    };
  }

  const distanceMiles = await calculateDistance(STORE_LOCATION, customerCoords);
  
  if (distanceMiles === null) {
    return {
      subtotal: 0,
      distanceMiles: 0,
      distanceFee: 0,
      serviceFees: 0,
      total: 0,
      isOutOfRange: true,
      outOfRangeMessage: 'Unable to calculate delivery distance. Please try again.',
    };
  }

  return calculateDeliveryFee(distanceMiles, selectedServices, config);
}

export function formatDeliveryFee(breakdown: DeliveryFeeBreakdown): string {
  if (breakdown.isOutOfRange) {
    return breakdown.outOfRangeMessage || 'Delivery not available';
  }

  if (breakdown.total === 0) {
    return 'FREE';
  }

  const parts: string[] = [];
  
  if (breakdown.distanceMiles <= DEFAULT_DELIVERY_CONFIG.freeRadiusMiles) {
    parts.push('FREE');
  } else {
    parts.push(`$${breakdown.distanceFee.toFixed(2)}`);
  }

  if (breakdown.serviceFees > 0) {
    parts.push(`+ $${breakdown.serviceFees.toFixed(2)} services`);
  }

  return parts.join(' ');
}

export function cartHasPickupOnlyItems(
  cartItems: Array<{ pickup_only?: boolean }>
): boolean {
  return cartItems.some(item => item.pickup_only);
}
