import { AppError } from "../utils/AppError.js";

type NominatimAddress = Record<string, string | undefined>;

type NominatimReverseResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

export type ParsedAddress = {
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

function pickCity(a: NominatimAddress): string | undefined {
  return (
    a.city ||
    a.town ||
    a.village ||
    a.suburb ||
    a.county ||
    a.state_district ||
    undefined
  );
}

function pickStreet(a: NominatimAddress): string | undefined {
  const parts = [
    a.house_number,
    a.road,
    a.pedestrian,
    a.footway,
    a.neighbourhood,
    a.suburb,
    a.quarter,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return a.hamlet || a.locality || undefined;
}

function parseNominatimAddress(a: NominatimAddress): ParsedAddress {
  const pincodeRaw = a.postcode?.replace(/\D/g, "") ?? "";
  return {
    street: pickStreet(a),
    city: pickCity(a),
    state: a.state,
    pincode: pincodeRaw.slice(0, 6) || undefined,
    country: a.country ?? "India",
  };
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ParsedAddress> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new AppError("Invalid coordinates", 400);
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "QuickBite-FoodApp/1.0 (clone-backend; restaurant-portal)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    throw new AppError("Reverse geocoding failed", 502);
  }

  const data = (await res.json()) as NominatimReverseResponse;
  if (!data.address) {
    throw new AppError("No address found for this location", 404);
  }

  return parseNominatimAddress(data.address);
}
