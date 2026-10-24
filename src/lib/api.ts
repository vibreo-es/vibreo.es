import type { AlbumChartEntry } from "@/components/AlbumChartRow";
import type { ArtistChartEntry } from "@/components/ArtistChartRow";
import type { ChartEntry } from "@/components/ChartRow";

const DIRECT_API = "https://api.vibreo.es";

export type YouTubeLinks = Record<string, { m?: string; v?: string; vt?: string }>;

export interface ListenerChartEntry {
  artist_uri: string;
  artist_id: string;
  artist_name: string;
  image_url: string;
  rank: number;
  previous_rank: number | null;
  listeners: number;
  daily_change: number;
  peak_rank: number | null;
  peak_listeners: number;
}

export interface ListenerChartPage {
  items: ListenerChartEntry[];
  limit: number;
  nextOffset: number | null;
  offset: number;
  total: number;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const isBrowser = typeof window !== "undefined";

function getApiBase(): string {
  if (!isBrowser) return DIRECT_API;
  return "/api-proxy";
}

async function apiFetch<T>(path: string): Promise<T> {
  const base = getApiBase();
  const headers: HeadersInit = {};

  if (!isBrowser) {
    headers["Origin"] = "https://vibreo.es";
  }

  const res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("Something went wrong. Please try again later.");
  return res.json();
}

export async function getLatest() {
  return apiFetch<{ songs_daily: string; artists_daily: string; albums_weekly: string; updated_at?: string }>("/latest");
}

export async function getChartSongsDaily(country: string, date: string) {
  return apiFetch<ChartEntry[]>(`/charts/songs/daily/${country}/${date}`);
}

export async function getChartArtistsDaily(country: string, date: string) {
  return apiFetch<ArtistChartEntry[]>(`/charts/artists/daily/${country}/${date}`);
}

export async function getChartAlbumsWeekly(country: string, date: string) {
  return apiFetch<AlbumChartEntry[]>(`/charts/albums/weekly/${country}/${date}`);
}

export async function getSong<T>(id: string) {
  return apiFetch<T>(`/songs/${id}`);
}

export async function getArtist<T>(id: string) {
  return apiFetch<T>(`/artists/${id}`);
}

export async function getAlbum<T>(id: string) {
  return apiFetch<T>(`/albums/${id}`);
}

export async function getChartingSongs<T>() {
  return apiFetch<T>("/charting/songs");
}

export async function getChartingArtists<T>() {
  return apiFetch<T>("/charting/artists");
}

export async function getChartingArtist<T>(id: string) {
  return apiFetch<T>(`/charting/artists/${id}`);
}

export async function getChartingAlbums<T>() {
  return apiFetch<T>("/charting/albums");
}

export async function getChartingArtistAlbums<T>(id: string) {
  return apiFetch<T>(`/charting/albums/${id}`);
}

export async function getChartingListeners<T>() {
  return apiFetch<T>("/charting/listeners");
}

export async function getArtistListener(id: string) {
  return apiFetch<ListenerChartEntry>(`/charting/listeners/${id}`);
}

export async function getChartingListenersPage({ limit, offset }: { limit: number; offset: number }) {
  return apiFetch<ListenerChartPage>(`/charting/listeners?limit=${limit}&offset=${offset}`);
}

export async function getMarketStreams() {
  return apiFetch<Record<string, number>>("/charting/market-streams");
}

export function getHeroVideoUrl(trackId: string): string {
  return `/api-proxy/hero-video/${trackId}`;
}

export async function resolveHeroVideoTrack({
  trackIds = [],
  artistIds = [],
}: {
  trackIds?: string[];
  artistIds?: string[];
}) {
  const params = new URLSearchParams();
  if (trackIds.length > 0) params.set("track_ids", trackIds.join(","));
  if (artistIds.length > 0) params.set("artist_ids", artistIds.join(","));
  return apiFetch<{ track_id: string | null }>(`/charting/hero-video?${params.toString()}`);
}

export async function getYouTubeLinks() {
  return apiFetch<YouTubeLinks>("/charting/youtube-links");
}

export async function getArtistYouTubeLinks(id: string) {
  return apiFetch<YouTubeLinks>(`/charting/youtube-links/${id}`);
}

export async function getArtistChannels() {
  return apiFetch<Record<string, string>>("/charting/artist-channels");
}

export async function searchAll(q: string) {
  return apiFetch<{
    query: string;
    topResult: {
      type: 'song' | 'artist' | 'album';
      uri: string;
      title: string;
      subtitle: string;
      image_url: string;
      score: number;
    } | null;
    artists: Array<{
      type: 'song' | 'artist' | 'album';
      uri: string;
      title: string;
      subtitle: string;
      image_url: string;
      score: number;
    }>;
    songs: Array<{
      type: 'song' | 'artist' | 'album';
      uri: string;
      title: string;
      subtitle: string;
      image_url: string;
      score: number;
    }>;
    albums: Array<{
      type: 'song' | 'artist' | 'album';
      uri: string;
      title: string;
      subtitle: string;
      image_url: string;
      score: number;
    }>;
    meta: {
      interpretedIntent: 'artist' | 'song' | 'album' | 'mixed';
      totalCandidates: number;
    };
  }>(`/search?q=${encodeURIComponent(q)}`);
}
