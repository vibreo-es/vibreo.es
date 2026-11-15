'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Crown, Flame, Music, TrendingUp } from 'lucide-react';
import { getChartSongsDaily, getLatest, getYouTubeLinks, getHeroVideoUrl, getErrorMessage } from '@/lib/api';
import { formatStreams } from '@/lib/format';
import { ChartRowExpandable, DetailCard as DebutDetailCard, AlbumThumb, type ChartEntry } from '@/components/ChartRow';
import { ImageModal } from '@/components/ImageModal';
import { VideoHero } from '@/components/VideoHero';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatArtists(raw: string): string {
  return raw.split('|').join(', ');
}

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function timeAgo(isoStr: string): string {
  const updated = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ── Skeletons ───────────────────────────────────────────────────────── */

function HeroSkeleton() {
  return (
    <section className="relative">
      <div className="relative flex min-h-[calc(75svh-2.625rem)] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-800/50 via-zinc-900 to-zinc-950 px-4 py-8 pb-20 md:pb-24">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-zinc-950/75 to-zinc-950 md:h-48" />
        <div className="w-[160px] h-[160px] md:w-[200px] md:h-[200px] rounded-xl bg-zinc-800 animate-pulse" />
        <div className="mt-5 w-48 h-6 bg-zinc-800 rounded animate-pulse" />
        <div className="mt-2 w-32 h-4 bg-zinc-800 rounded animate-pulse" />
        <div className="mt-4 flex gap-3">
          <div className="w-20 h-6 bg-zinc-800 rounded-full animate-pulse" />
          <div className="w-20 h-6 bg-zinc-800 rounded-full animate-pulse" />
          <div className="w-20 h-6 bg-zinc-800 rounded-full animate-pulse" />
        </div>
        <div className="mt-4 w-56 h-3 bg-zinc-800 rounded animate-pulse" />
      </div>
    </section>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-8 h-8 bg-zinc-800 rounded animate-pulse" />
      <div className="w-10 h-10 bg-zinc-800 rounded animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="w-32 h-3.5 bg-zinc-800 rounded animate-pulse" />
        <div className="w-24 h-3 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="w-12 h-3.5 bg-zinc-800 rounded animate-pulse" />
    </div>
  );
}

/* ── Section Header ──────────────────────────────────────────────────── */

function SectionHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon?: typeof Music;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} className="text-zinc-400 shrink-0" />}
        <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
      </div>
      <p className="text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function Home() {
  const [allSongs, setAllSongs] = useState<ChartEntry[]>([]);
  const [chartDate, setChartDate] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUri, setExpandedUri] = useState<string | null>(null);
  const [showHeroImage, setShowHeroImage] = useState(false);
  const [ytLinksMap, setYtLinksMap] = useState<Record<string, { m?: string; v?: string; vt?: string }>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [latest, data] = await Promise.all([
          getLatest(),
          getChartSongsDaily('global', 'latest'),
        ]);
        if (cancelled) return;
        setChartDate(latest.songs_daily);
        if (latest.updated_at) setUpdatedAt(latest.updated_at);
        setAllSongs(data);
        setYtLinksMap({});

        void getYouTubeLinks()
          .then((ytData) => {
            if (!cancelled) setYtLinksMap(ytData);
          })
          .catch(() => {});
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load chart data'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
  }, []);

  /* Derived data */
  const hero = allSongs[0] ?? null;
  const top10 = allSongs.slice(0, 10);

  // Debuts: prioritize "Today" (NEW_ENTRY), fallback to "This Week" (≤7 days on chart)
  const debutsToday = allSongs.filter(
    (s) => s.entry_status === 'NEW_ENTRY' || (s.previous_rank === 0 && s.days_on_chart <= 1),
  );
  const debutsThisWeek = allSongs
    .filter((s) => s.days_on_chart > 0 && s.days_on_chart <= 7)
    .sort((a, b) => a.rank - b.rank);

  const hasDebutsToday = debutsToday.length > 0;
  const debuts = hasDebutsToday ? debutsToday.slice(0, 8) : debutsThisWeek.slice(0, 8);
  const debutsTitle = hasDebutsToday ? 'Today' : 'This Week';
  const debutsSubtitle = hasDebutsToday ? 'New entries today' : 'Fresh entries this week';

  const movers = allSongs
    .filter((s) => s.previous_rank > 0 && s.previous_rank > s.rank)
    .sort((a, b) => (b.previous_rank - b.rank) - (a.previous_rank - a.rank))
    .slice(0, 5);

  /* ── Loading ─────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <main className="flex flex-col gap-8 min-h-screen">
        <HeroSkeleton />
        <section className="px-4 w-full max-w-3xl mx-auto">
          <div className="w-36 h-5 bg-zinc-800 rounded animate-pulse mb-3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </section>
      </main>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────── */

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center space-y-3">
          <p className="text-zinc-400 text-sm">Couldn&apos;t load chart data right now.</p>
          <button onClick={() => window.location.reload()} className="text-sm text-zinc-500 hover:text-zinc-200 transition underline">Try again</button>
        </div>
      </main>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <main className="flex min-h-screen flex-col">
      {/* ─── Section 1: Hero Spotlight ─────────────────────────────── */}
      {hero && (() => {
        const heroTrackId = hero.uri.split(':').pop() || '';
        const heroVideoSrc = ytLinksMap[hero.uri]?.v ? getHeroVideoUrl(heroTrackId, ytLinksMap[hero.uri].v) : null;

        return (
        <section className="relative">
          <VideoHero
            videoSrc={heroVideoSrc}
            className="min-h-[calc(75svh-2.625rem)]"
            overlayClassName="bg-gradient-to-b from-black/55 via-black/35 to-zinc-950/90"
            fallbackClassName="bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950"
            fallbackMedia={hero.image_url ? (
              <Image
                src={hero.image_url}
                alt=""
                fill
                sizes="100vw"
                className="blur-3xl scale-110 opacity-40 object-cover absolute inset-0 z-0"
                aria-hidden="true"
              />
            ) : null}
          >
            <div className="mx-auto flex min-h-[calc(75svh-2.625rem)] w-full max-w-3xl flex-col items-center justify-center px-4 py-8 pb-20 md:pb-24">
              {hero.image_url ? (
                <button
                  type="button"
                  onClick={() => setShowHeroImage(true)}
                  className="cursor-pointer rounded-xl"
                  aria-label={`Open ${hero.track_name} artwork`}
                >
                  <Image
                    src={hero.image_url}
                    alt={hero.track_name}
                    width={200}
                    height={200}
                    className="w-[160px] h-[160px] md:w-[200px] md:h-[200px] rounded-xl shadow-2xl"
                    priority
                  />
                </button>
              ) : (
                <div className="w-[160px] h-[160px] md:w-[200px] md:h-[200px] rounded-xl shadow-2xl bg-zinc-800 flex items-center justify-center">
                  <Music size={64} className="text-zinc-600" />
                </div>
              )}
              {showHeroImage && hero.image_url && (
                <ImageModal src={hero.image_url.replace('ab67616d00001e02', 'ab67616d0000b273')} alt={hero.track_name} onClose={() => setShowHeroImage(false)} />
              )}
              <h1 className="mt-5 text-2xl md:text-3xl font-extrabold text-zinc-50 text-center leading-tight">
                <Link href={`/song/${hero.uri.split(':').pop()}`} className="hover:text-white transition">
                  {hero.track_name}
                </Link>
              </h1>
              <p className="mt-1 text-base text-zinc-300 text-center">
                {hero.artist_names.split('|').map((name, i) => {
                  const uris = hero.artist_uris.split('|');
                  const artistId = (uris[i] || '').split(':').pop() || '';
                  return (
                    <span key={artistId || i}>
                      {i > 0 && ', '}
                      <Link href={`/artist/${artistId}`} className="hover:text-white transition">
                        {name.trim()}
                      </Link>
                    </span>
                  );
                })}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full">
                  <Crown size={12} className="shrink-0" />
                  #1 Global
                </span>
                <span className="text-xs font-medium bg-zinc-700/60 text-zinc-300 px-2.5 py-1 rounded-full">
                  {formatStreams(hero.streams)} streams
                </span>
                <span className="text-xs font-medium bg-zinc-700/60 text-zinc-300 px-2.5 py-1 rounded-full">
                  {hero.days_on_chart}d on chart
                </span>
              </div>
              {chartDate && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <p className="text-xs text-zinc-500">
                    Spotify Global Daily Chart · {formatChartDate(chartDate)}
                  </p>
                  {updatedAt && (
                    <span className="inline-flex items-center gap-1.5 bg-green-500/15 text-green-400 text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                      </span>
                      Updated {timeAgo(updatedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </VideoHero>
        </section>
        );
      })()}

      {/* ─── Section 2: What's Hot — Top 10 ────────────────────────── */}
      <section className="relative z-20 -mt-16 mx-auto w-full max-w-3xl min-h-0 px-0 sm:-mt-[5.25rem] sm:px-4">
        <div className="px-4 sm:px-0">
          <SectionHeader title="What's Hot" subtitle="Top 10 Global" icon={Flame} />
        </div>

        <div className="overflow-hidden rounded-none border-y border-zinc-800/60 sm:rounded-2xl sm:border">
          {top10.map((song, index) => (
            <ChartRowExpandable
              key={song.uri}
              song={song}
              index={index}
              isExpanded={expandedUri === song.uri}
              onToggle={() => setExpandedUri(expandedUri === song.uri ? null : song.uri)}
                    ytLinks={ytLinksMap[song.uri]}
              striped
            />
          ))}
        </div>

        <div className="mt-4 px-4 sm:px-0">
          <Link
            href="/charts/global"
            className="flex items-center justify-center gap-1.5 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition w-full text-center"
          >
            <span>See full chart</span>
            <ChevronRight size={16} className="shrink-0" />
          </Link>
        </div>
      </section>

      {/* ─── Section 3: Top Debuts ─────────────────────────────────── */}
      <section className="mx-auto mt-8 w-full max-w-3xl px-4 sm:mt-10">
        <SectionHeader title={`Top Debuts ${debutsTitle}`} subtitle={debutsSubtitle} icon={Music} />

        {debuts.length === 0 ? (
          <p className="text-sm text-zinc-600">No debuts this week</p>
        ) : (
          <div className="relative">
            <div className="flex gap-3 overflow-x-auto pb-2 pr-4 snap-x snap-mandatory scrollbar-none">
              {debuts.map((song) => (
                <div
                  key={song.uri}
                  onClick={() => setExpandedUri(expandedUri === song.uri ? null : song.uri)}
                  className="shrink-0 w-[140px] snap-start bg-zinc-800/50 rounded-xl p-3 flex flex-col items-center cursor-pointer hover:bg-zinc-800/80 transition"
                >
                  <AlbumThumb src={song.image_url} alt={song.track_name} size={36} className="rounded" />
                  <p className="mt-2 text-xs font-bold text-zinc-100 text-center truncate w-full">
                    {song.track_name}
                  </p>
                  <p className="text-[11px] text-zinc-400 text-center truncate w-full">
                    {formatArtists(song.artist_names)}
                  </p>
                  <span className="mt-1.5 text-[10px] font-bold tracking-wide bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                    #{song.rank}
                  </span>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent" />
          </div>
        )}

        {/* Expanded detail for debut card — detail only, no chart row */}
        {expandedUri && debuts.some(s => s.uri === expandedUri) && (() => {
          const song = debuts.find(s => s.uri === expandedUri);
          if (!song) return null;
          return (
            <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-800/60">
              <DebutDetailCard song={song} onClose={() => setExpandedUri(null)} />
            </div>
          );
        })()}
      </section>

      {/* ─── Section 4: Biggest Movers ─────────────────────────────── */}
      {movers.length > 0 && (
        <section className="mx-auto mt-8 w-full max-w-3xl min-h-0 px-0 pb-4 sm:mt-10 sm:px-4">
          <div className="px-4 sm:px-0">
            <SectionHeader title="Biggest Movers" subtitle="Climbing the charts" icon={TrendingUp} />
          </div>

          <div className="overflow-hidden rounded-none border-y border-zinc-800/60 sm:rounded-2xl sm:border">
            {movers.map((song, index) => (
              <ChartRowExpandable
                key={song.uri}
                song={song}
                index={index}
                isExpanded={expandedUri === song.uri}
                onToggle={() => setExpandedUri(expandedUri === song.uri ? null : song.uri)}
                    ytLinks={ytLinksMap[song.uri]}
                striped
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
