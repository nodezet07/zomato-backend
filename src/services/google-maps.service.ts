import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import type { ParsedAddress } from "./geocode.service.js";

function googleKey(kind: "geocoding" | "places" | "routes"): string | undefined {
  if (kind === "geocoding") return env.GOOGLE_GEOCODING_API_KEY;
  if (kind === "places") return env.GOOGLE_PLACES_API_KEY;
  return env.GOOGLE_ROUTES_API_KEY;
}

function parseGoogleAddress(
  components: Array<{ long_name: string; short_name: string; types: string[] }>,
): ParsedAddress {
  const pick = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name;

  const streetNumber = pick("street_number");
  const route = pick("route");
  const street =
    [streetNumber, route].filter(Boolean).join(" ") ||
    pick("sublocality") ||
    pick("neighborhood");

  return {
    street: street || undefined,
    city:
      pick("locality") ||
      pick("administrative_area_level_2") ||
      pick("sublocality_level_1") ||
      undefined,
    state: pick("administrative_area_level_1"),
    pincode: pick("postal_code")?.replace(/\D/g, "").slice(0, 6) || undefined,
    country: pick("country") ?? "India",
  };
}

export async function googleReverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ParsedAddress | null> {
  const key = googleKey("geocoding");
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
    }>;
  };

  if (data.status !== "OK" || !data.results?.[0]?.address_components) {
    return null;
  }

  return parseGoogleAddress(data.results[0].address_components);
}

export type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
};

export async function googlePlacesAutocomplete(
  input: string,
  options?: { latitude?: number; longitude?: number },
): Promise<PlaceSuggestion[]> {
  const key = googleKey("places");
  if (!key || input.trim().length < 2) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input.trim());
  url.searchParams.set("key", key);
  url.searchParams.set("components", "country:in");
  url.searchParams.set("language", "en");
  if (options?.latitude != null && options?.longitude != null) {
    url.searchParams.set("location", `${options.latitude},${options.longitude}`);
    url.searchParams.set("radius", "30000");
  }

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = (await res.json()) as {
    status?: string;
    predictions?: Array<{
      place_id: string;
      description: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
    }>;
  };

  if (data.status !== "OK" || !data.predictions) return [];

  return data.predictions.map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text,
    secondaryText: p.structured_formatting?.secondary_text,
  }));
}

export async function googlePlaceDetails(placeId: string): Promise<{
  latitude: number;
  longitude: number;
  formattedAddress: string;
  parsed: ParsedAddress;
} | null> {
  const key = googleKey("places");
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "geometry,formatted_address,address_components");
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    result?: {
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
    };
  };

  const result = data.result;
  if (!result) return null;
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (data.status !== "OK" || lat == null || lng == null) return null;

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: result.formatted_address ?? "",
    parsed: result.address_components
      ? parseGoogleAddress(result.address_components)
      : {},
  };
}

export async function googleRouteEtaMinutes(input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
}): Promise<number | null> {
  const route = await googleComputeRoute(input);
  if (!route?.duration) return null;
  const seconds = Number.parseInt(route.duration.replace("s", ""), 10);
  if (!Number.isFinite(seconds)) return null;
  return Math.max(1, Math.ceil(seconds / 60));
}

function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

async function googleComputeRoute(input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  intermediates?: Array<{ latitude: number; longitude: number }>;
}): Promise<{ duration?: string; encodedPolyline?: string } | null> {
  const key = googleKey("routes");
  if (!key) return null;

  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: input.origin.latitude,
          longitude: input.origin.longitude,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: input.destination.latitude,
          longitude: input.destination.longitude,
        },
      },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
  };

  if (input.intermediates?.length) {
    body.intermediates = input.intermediates.map((p) => ({
      location: { latLng: { latitude: p.latitude, longitude: p.longitude } },
    }));
  }

  const res = await fetch(
    `https://routes.googleapis.com/directions/v2:computeRoutes?key=${key}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as {
    routes?: Array<{ duration?: string; polyline?: { encodedPolyline?: string } }>;
  };

  const route = data.routes?.[0];
  if (!route) return null;
  return {
    duration: route.duration,
    encodedPolyline: route.polyline?.encodedPolyline,
  };
}

export async function googleRoutePolyline(input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  waypoints?: Array<{ latitude: number; longitude: number }>;
}): Promise<Array<{ latitude: number; longitude: number }> | null> {
  const route = await googleComputeRoute({
    origin: input.origin,
    destination: input.destination,
    intermediates: input.waypoints,
  });
  if (!route?.encodedPolyline) return null;
  return decodePolyline(route.encodedPolyline);
}
