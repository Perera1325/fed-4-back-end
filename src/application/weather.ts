import { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { User } from "../infrastructure/entities/User";
import { SolarUnit } from "../infrastructure/entities/SolarUnit";
import { NotFoundError } from "../domain/errors/errors";

const DEFAULT_LATITUDE = process.env.WEATHER_DEFAULT_LAT
  ? parseFloat(process.env.WEATHER_DEFAULT_LAT)
  : 6.9271; // Colombo, Sri Lanka
const DEFAULT_LONGITUDE = process.env.WEATHER_DEFAULT_LON
  ? parseFloat(process.env.WEATHER_DEFAULT_LON)
  : 79.8612;

const CACHE_TTL_MS = 15 * 60 * 1000;
const weatherCache = new Map<string, { data: any; expiresAt: number }>();

function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Unknown";
}

function buildSolarContext(cloudCoverPercent: number, weatherCode: number): string {
  if ([95, 96, 99].includes(weatherCode)) {
    return "Thunderstorms nearby — expect sharply reduced generation and possible safety cutoffs.";
  }
  if (cloudCoverPercent >= 80) {
    return "Heavy cloud cover today — expect generation well below a clear-sky day.";
  }
  if (cloudCoverPercent >= 40) {
    return "Partly cloudy — expect somewhat lower generation than a clear day.";
  }
  return "Clear skies — good conditions for peak solar generation.";
}

async function getCoordinatesForUser(clerkUserId: string) {
  const user = await User.findOne({ clerkUserId });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const solarUnit = await SolarUnit.findOne({ userId: user._id });
  if (!solarUnit) {
    throw new NotFoundError("Solar unit not found");
  }

  const latitude = solarUnit.get("latitude") ?? DEFAULT_LATITUDE;
  const longitude = solarUnit.get("longitude") ?? DEFAULT_LONGITUDE;

  return { latitude, longitude };
}

export const getWeatherForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = getAuth(req);
    const { latitude, longitude } = await getCoordinatesForUser(auth.userId!);

    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.data);
    }

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", latitude.toString());
    url.searchParams.set("longitude", longitude.toString());
    url.searchParams.set(
      "current",
      "temperature_2m,cloud_cover,weather_code,shortwave_radiation"
    );
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as any;
    const current = payload.current;

    const data = {
      temperatureCelsius: current.temperature_2m,
      cloudCoverPercent: current.cloud_cover,
      shortwaveRadiationWm2: current.shortwave_radiation,
      condition: describeWeatherCode(current.weather_code),
      solarContext: buildSolarContext(current.cloud_cover, current.weather_code),
      fetchedAt: new Date().toISOString(),
    };

    weatherCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};