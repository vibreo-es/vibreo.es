'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Music } from 'lucide-react';
import { SpotifyIcon, YouTubeMusicIcon, YouTubeIcon } from '@/components/PlatformIcons';
import { ImageModal } from '@/components/ImageModal';
import { VideoHero } from '@/components/VideoHero';
import { getSong, getChartingSongs, getYouTubeLinks, getMarketStreams, getHeroVideoUrl, getErrorMessage } from '@/lib/api';
import { FlagIcon } from '@/components/FlagIcon';
import { getCountryName } from '@/lib/countries';
import { formatStreams } from '@/lib/format';

interface SongEntity {
  track_uri: string;
  primary_uri?: string;
  track_name: string;
  artist_names: string;
  artist_uris: string;
  label: string;
  release_date: string;
  image_url: string;
}

interface ChartPosition {
  country: string;
  rank: number;
  streams: number;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractId(uri: string) {
  return uri.split(':').pop() || uri;
}

function AlbumThumb({ src, alt, size }: { src: string; alt: string; size: number }) {
  if (!src) {
    return (
      <div className="flex items-center justify-center bg-zinc-800 rounded-xl" style={{ width: size, height: size }}>
        <Music size={size / 3} className="text-zinc-600" />
      </div>
    );
  }
  return <Image src={src} alt={alt} width={size} height={size} className="rounded-xl shadow-lg" priority />;
}

export default function SongPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || '';
  const router = useRouter();

  const [song, setSong] = useState<SongEntity | null>(null);
  const [positions, setPositions] = useState<ChartPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [ytLinks, setYtLinks] = useState<{ m?: string; v?: string; vt?: string } | null>(null);
  const [marketStreams, setMarketStreams] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setYtLinks(null);

    async function load() {
      try {
        const [songData, chartingData, mktStreams] = await Promise.all([
          getSong<SongEntity>(id),
          getChartingSongs<Record<string, ChartPosition[]>>(),
          getMarketStreams().catch(() => ({} as Record<string, number>)),
        ]);
        if (cancelled) return;
        setSong(songData);

        const routeUri = `spotify:track:${id}`;
        const primaryUri = songData.primary_uri || songData.track_uri || routeUri;
        const pos: ChartPosition[] = chartingData[primaryUri] || chartingData[songData.track_uri] || chartingData[routeUri] || [];
        // Sort by streams descending (biggest markets first)
        pos.sort((a: ChartPosition, b: ChartPosition) => b.streams - a.streams);
        setPositions(pos);

        setMarketStreams(mktStreams);

        void getYouTubeLinks()
          .then((ytData) => {
            if (!cancelled) {
              setYtLinks(ytData[primaryUri] || ytData[songData.track_uri] || ytData[routeUri] || null);
            }
          })
          .catch(() => {});
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load song'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen px-4 pt-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="w-20 h-4 bg-zinc-800 rounded animate-pulse" />
          <div className="flex flex-col items-center gap-4">
            <div className="w-[200px] h-[200px] bg-zinc-800 rounded-xl animate-pulse" />
            <div className="w-48 h-6 bg-zinc-800 rounded animate-pulse" />
            <div className="w-32 h-4 bg-zinc-800 rounded animate-pulse" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-zinc-800/50 rounded animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !song) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm">{error || 'Song not found'}</p>
          <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-zinc-200 transition">← Go back</button>
        </div>
      </main>
    );
  }

  const artistList = song.artist_names.split('|').map((name, i) => {
    const uris = song.artist_uris.split('|');
    return { name: name.trim(), id: extractId(uris[i]?.trim() || '') };
  });

  // Filtered streams: use global if charting there, otherwise sum all markets
  const globalPos = positions.find(p => p.country === 'global');
  const filteredStreams = globalPos ? globalPos.streams : positions.reduce((sum, p) => sum + p.streams, 0);

  // Featured position: show rank in the BIGGEST market (by total market streams)
  // Global always wins if present, otherwise pick the market with highest total streams
  const featuredPos = (() => {
    if (positions.length === 0) return null;
    const global = positions.find(p => p.country === 'global');
    if (global) return global;
    // Sort by market size (total streams of the whole Top 200), pick biggest
    return [...positions].sort((a, b) => {
      const aSize = marketStreams[a.country] || 0;
      const bSize = marketStreams[b.country] || 0;
      return bSize - aSize;
    })[0];
  })();

  const primaryTrackUri = song.primary_uri || song.track_uri || `spotify:track:${id}`;
  const primaryTrackId = extractId(primaryTrackUri);
  const heroVideoSrc = ytLinks?.v ? getHeroVideoUrl(primaryTrackId, ytLinks.v) : null;

  return (
    <main className="min-h-screen">
      <VideoHero
        videoSrc={heroVideoSrc}
        className="mb-8"
        fallbackClassName="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800"
        overlayClassName="bg-gradient-to-b from-black/70 via-black/50 to-zinc-950/90"
        fallbackMedia={song.image_url ? (
          <Image
            src={song.image_url}
            alt=""
            fill
            sizes="100vw"
            className="blur-3xl scale-110 opacity-40 object-cover absolute inset-0 z-0"
            aria-hidden="true"
          />
        ) : null}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-8">
          {/* Back */}
          <button
            onClick={() => router.back()}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-800/60 bg-black/30 backdrop-blur-sm px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            Back
          </button>

          <div className="relative z-10 flex flex-col items-center text-center gap-4 px-2 py-2 md:px-6 md:py-4">
            <button
              type="button"
              onClick={() => song.image_url && setShowImage(true)}
              disabled={!song.image_url}
              className={song.image_url ? 'cursor-pointer rounded-xl' : 'cursor-default rounded-xl'}
              aria-label={song.image_url ? `Open ${song.track_name} artwork` : `${song.track_name} artwork unavailable`}
            >
              <AlbumThumb src={song.image_url} alt={song.track_name} size={200} />
            </button>
            {showImage && song.image_url && (
              <ImageModal src={song.image_url.replace('ab67616d00001e02', 'ab67616d0000b273')} alt={song.track_name} onClose={() => setShowImage(false)} />
            )}

            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-100">{song.track_name}</h1>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                {artistList.map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && <span className="text-zinc-600">, </span>}
                    <Link
                      href={`/artist/${a.id}`}
                      className="text-base text-zinc-300 hover:text-white transition"
                    >
                      {a.name}
                    </Link>
                  </span>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {positions.length > 0 && (
                <span className="text-xs font-medium bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full">
                  Charting in {positions.length} {positions.length === 1 ? 'country' : 'countries'}
                </span>
              )}
              {featuredPos && (
                <span className="text-xs font-medium bg-amber-500/15 text-amber-300 px-2.5 py-1 rounded-full">
                  #{featuredPos.rank} {getCountryName(featuredPos.country)}
                </span>
              )}
              {positions.length === 0 && (
                <span className="text-xs font-medium bg-zinc-700/50 text-zinc-400 px-2.5 py-1 rounded-full">
                  Not currently charting
                </span>
              )}
            </div>

            {/* External links */}
            <div className="flex gap-2 justify-center">
              <a
                href={`https://open.spotify.com/track/${primaryTrackId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-600/20 text-green-400 hover:bg-green-600/30 transition"
                title="Spotify"
              >
                <SpotifyIcon size={20} />
              </a>
              {ytLinks?.v && (
                <a
                  href={`https://www.youtube.com/watch?v=${ytLinks.v}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-600/20 text-red-400 hover:bg-red-600/30 transition"
                  title={ytLinks.vt === 'OMV' ? 'Music Video' : 'YouTube'}
                >
                  <YouTubeIcon size={20} />
                </a>
              )}
              {ytLinks?.m && (
                <a
                  href={`https://music.youtube.com/watch?v=${ytLinks.m}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-600/20 text-red-400 hover:bg-red-600/30 transition"
                  title="YouTube Music"
                >
                  <YouTubeMusicIcon size={20} />
                </a>
              )}
            </div>
          </div>
        </div>
      </VideoHero>

      <div className="mx-auto max-w-2xl px-4 space-y-8">
        {/* Details */}
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-zinc-300 border-b border-zinc-800/60">Details</h2>
          <div className="divide-y divide-zinc-800/40">
            <div className="flex justify-between px-4 py-3">
              <span className="text-xs text-zinc-500">Label</span>
              <span className="text-xs text-zinc-200 font-medium">{song.label || '—'}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-xs text-zinc-500">Released</span>
              <span className="text-xs text-zinc-200 font-medium">{formatDate(song.release_date)}</span>
            </div>
            {filteredStreams > 0 && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">
                  Daily filtered streams
                  <span className="text-[10px] text-zinc-600 ml-1">{globalPos ? '(global)' : '(sum of markets)'}</span>
                </span>
                <span className="text-xs text-zinc-200 font-medium">{formatStreams(filteredStreams)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Chart positions by country */}
        {positions.length > 0 && (
          <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold text-zinc-300 border-b border-zinc-800/60">
              <span className="flex items-center justify-between w-full">
                <span>Chart positions</span>
                <span className="text-xs font-normal text-zinc-500">{positions.length} {positions.length === 1 ? 'market' : 'markets'}</span>
              </span>
            </h2>

            <div className="divide-y divide-zinc-800/40">
              {positions.map((pos) => (
                <Link
                  key={pos.country}
                  href={`/charts/${pos.country}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition"
                >
                  <FlagIcon code={pos.country} size={20} />
                  <span className="text-sm text-zinc-300 flex-1">{getCountryName(pos.country)}</span>
                  <span className="text-sm font-bold text-zinc-100 tabular-nums w-10 text-right">#{pos.rank}</span>
                  <span className="text-xs text-zinc-500 tabular-nums w-14 text-right">{formatStreams(pos.streams)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
