'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Search, X } from 'lucide-react';
import { SpotifyIcon } from '@/components/PlatformIcons';
import { FlagIcon } from '@/components/FlagIcon';
import { ChartRowExpandable, type ChartEntry } from '@/components/ChartRow';
import { ArtistChartRow, type ArtistChartEntry } from '@/components/ArtistChartRow';
import { AlbumChartRow, type AlbumChartEntry } from '@/components/AlbumChartRow';
import { DatePicker } from '@/components/DatePicker';
import { VideoHero } from '@/components/VideoHero';
import {
  getChartSongsDaily,
  getChartArtistsDaily,
  getChartAlbumsWeekly,
  getLatest,
  getMarketStreams,
  getYouTubeLinks,
  resolveHeroVideoTrack,
  getHeroVideoUrl,
  getErrorMessage,
} from '@/lib/api';
import { COUNTRY_CODES, getCountryName } from '@/lib/countries';
import { formatStreams } from '@/lib/format';

type ChartType = 'songs' | 'artists' | 'albums';

const CHART_TABS: { type: ChartType; label: string }[] = [
  { type: 'songs', label: 'Songs' },
  { type: 'artists', label: 'Artists' },
  { type: 'albums', label: 'Albums' },
];

function formatChartDate(dateStr: string, type: ChartType) {
  const date = new Date(`${dateStr}T00:00:00`);

  if (type === 'albums') {
    const end = new Date(date);
    end.setDate(end.getDate() + 6);

    const startLabel = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endLabel = end.toLocaleDateString('en-US', {
      month: date.getMonth() === end.getMonth() ? undefined : 'short',
      day: 'numeric',
      year: date.getFullYear() === end.getFullYear() ? undefined : 'numeric',
    });
    const yearLabel = end.getFullYear();

    return `Week ${startLabel}-${endLabel}, ${yearLabel}`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function chartSubtitle(type: ChartType) {
  if (type === 'songs') return 'Songs Top 200';
  if (type === 'artists') return 'Artists Top 200';
  return 'Albums Top 200';
}

function extractId(uri: string) {
  return uri.split(':').pop() || uri;
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <div
      className={`flex items-center gap-3 border-b border-zinc-800/50 px-4 py-3 ${
        index % 2 === 0 ? 'bg-zinc-900/30' : ''
      }`}
    >
      <div className="h-4 w-8 shrink-0 animate-pulse rounded bg-zinc-800" />
      <div className="h-9 w-9 shrink-0 animate-pulse rounded bg-zinc-800" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3.5 w-36 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="h-3.5 w-14 shrink-0 animate-pulse rounded bg-zinc-800" />
    </div>
  );
}

function HeroHighlightSkeleton() {
  return (
    <div
      data-testid="chart-hero-highlight"
      aria-hidden="true"
      className="mt-4 flex min-h-[52px] items-center gap-3"
    >
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-zinc-800/80" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3 w-20 animate-pulse rounded bg-zinc-800/80" />
        <div className="h-3.5 w-36 animate-pulse rounded bg-zinc-800/80" />
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-800/80" />
      </div>
    </div>
  );
}

export default function ChartTypeDatePage() {
  const params = useParams<{ country: string; type: string; date: string }>();
  const router = useRouter();

  const currentCountry = String(params?.country || 'global').toLowerCase();
  const rawType = String(params?.type || 'songs').toLowerCase();
  const chartType: ChartType = (['songs', 'artists', 'albums'].includes(rawType) ? rawType : 'songs') as ChartType;
  const dateParam = String(params?.date || 'latest');

  const isValidCountry = COUNTRY_CODES.includes(currentCountry);

  // Data state
  const [songs, setSongs] = useState<ChartEntry[]>([]);
  const [artists, setArtists] = useState<ArtistChartEntry[]>([]);
  const [albums, setAlbums] = useState<AlbumChartEntry[]>([]);
  const [chartDate, setChartDate] = useState('');
  const [latestDates, setLatestDates] = useState<{ songs_daily: string; artists_daily: string; albums_weekly: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUri, setExpandedUri] = useState<string | null>(null);
  const [totalStreams, setTotalStreams] = useState<number | null>(null);
  const [ytLinksMap, setYtLinksMap] = useState<Record<string, { m?: string; v?: string; vt?: string }>>({});
  const [artistHeroVideoTrackId, setArtistHeroVideoTrackId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  // Build available dates set from latest (for now, generate a range going back)
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    if (!latestDates) return dates;
    const latestStr = chartType === 'albums' ? latestDates.albums_weekly : chartType === 'artists' ? latestDates.artists_daily : latestDates.songs_daily;
    if (!latestStr) return dates;
    // Generate last 90 days for daily charts, last 52 weeks for albums
    const latest = new Date(`${latestStr}T00:00:00`);
    if (chartType === 'albums') {
      // Weekly: add Thursdays going back 52 weeks
      for (let i = 0; i < 52; i++) {
        const d = new Date(latest);
        d.setDate(d.getDate() - i * 7);
        const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates.add(str);
      }
    } else {
      // Daily: add days going back 90 days
      for (let i = 0; i < 90; i++) {
        const d = new Date(latest);
        d.setDate(d.getDate() - i);
        const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates.add(str);
      }
    }
    return dates;
  }, [latestDates, chartType]);

  // Normalize filter
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const filteredSongs = useMemo(() => {
    if (!filterQuery.trim()) return songs;
    const q = normalize(filterQuery);
    return songs.filter((s) =>
      normalize(s.track_name).includes(q) || normalize(s.artist_names.replace(/\|/g, ' ')).includes(q)
    );
  }, [songs, filterQuery]);

  const filteredArtists = useMemo(() => {
    if (!filterQuery.trim()) return artists;
    const q = normalize(filterQuery);
    return artists.filter((a) => normalize(a.artist_name).includes(q));
  }, [artists, filterQuery]);

  const filteredAlbums = useMemo(() => {
    if (!filterQuery.trim()) return albums;
    const q = normalize(filterQuery);
    return albums.filter((a) =>
      normalize(a.album_name).includes(q) || normalize(a.artist_names.replace(/\|/g, ' ')).includes(q)
    );
  }, [albums, filterQuery]);

  useEffect(() => {
    if (!isValidCountry) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFilterQuery('');
    setExpandedUri(null);
    setArtistHeroVideoTrackId(null);

    async function load() {
      try {
        const latest = await getLatest();
        if (cancelled) return;
        setLatestDates(latest);

        const resolvedDate = dateParam === 'latest'
          ? (chartType === 'albums' ? latest.albums_weekly : chartType === 'artists' ? latest.artists_daily : latest.songs_daily)
          : dateParam;

        setChartDate(resolvedDate);

        if (chartType === 'songs') {
          const [chartData, streams] = await Promise.all([
            getChartSongsDaily(currentCountry, dateParam),
            getMarketStreams().catch(() => ({} as Record<string, number>)),
          ]);
          if (cancelled) return;
          setSongs(chartData);
          setArtists([]);
          setAlbums([]);
          if (streams[currentCountry]) setTotalStreams(streams[currentCountry]);
          else setTotalStreams(null);
          setYtLinksMap({});

          void getYouTubeLinks()
            .then((ytData) => {
              if (!cancelled) setYtLinksMap(ytData);
            })
            .catch(() => {});
        } else if (chartType === 'artists') {
          const chartData = await getChartArtistsDaily(currentCountry, dateParam);
          if (cancelled) return;
          setArtists(chartData);
          setSongs([]);
          setAlbums([]);
          setTotalStreams(null);
          setYtLinksMap({});

          const topArtistId = chartData[0]?.uri ? extractId(chartData[0].uri) : '';
          if (topArtistId) {
            void resolveHeroVideoTrack({ artistIds: [topArtistId] })
              .then(({ track_id }) => {
                if (!cancelled) setArtistHeroVideoTrackId(track_id);
              })
              .catch(() => {});
          }
        } else {
          const chartData = await getChartAlbumsWeekly(currentCountry, dateParam);
          if (cancelled) return;
          setAlbums(chartData);
          setSongs([]);
          setArtists([]);
          setTotalStreams(null);
          setYtLinksMap({});
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load chart'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
  }, [currentCountry, chartType, dateParam, isValidCountry]);

  const hasData = songs.length > 0 || artists.length > 0 || albums.length > 0;

  // Hero video for #1 song or the first available video from the #1 artist
  const numberOneSong = chartType === 'songs' ? songs[0] || null : null;
  const numberOneArtist = chartType === 'artists' ? artists[0] || null : null;
  const heroVideoSrc = (() => {
    if (numberOneSong) {
      const yt = ytLinksMap[numberOneSong.uri];
      if (!yt?.v) return null;
      return getHeroVideoUrl(extractId(numberOneSong.uri), yt.v);
    }
    if (!numberOneArtist || !artistHeroVideoTrackId) return null;
    return getHeroVideoUrl(artistHeroVideoTrackId);
  })();
  const heroFallbackImageUrl = numberOneSong?.image_url || numberOneArtist?.image_url || '';
  const heroHighlight = numberOneSong
    ? {
        imageUrl: numberOneSong.image_url,
        imageAlt: numberOneSong.track_name,
        title: numberOneSong.track_name,
        subtitle: numberOneSong.artist_names.split('|').join(', '),
        imageClassName: 'h-12 w-12 shrink-0 rounded-lg object-cover shadow-lg',
      }
    : numberOneArtist
      ? {
          imageUrl: numberOneArtist.image_url,
          imageAlt: numberOneArtist.artist_name,
          title: numberOneArtist.artist_name,
          subtitle: 'Artist chart #1',
          imageClassName: 'h-12 w-12 shrink-0 rounded-full object-cover shadow-lg',
        }
      : null;

  const handleDateSelect = (date: string) => {
    router.push(`/charts/${currentCountry}/${chartType}/${date}`);
  };

  const filterPlaceholder = chartType === 'songs'
    ? 'Filter by song or artist'
    : chartType === 'artists'
      ? 'Filter by artist'
      : 'Filter by album or artist';

  const columnHeader = chartType === 'songs' ? 'Streams' : chartType === 'artists' ? 'Days' : 'Weeks';

  return (
    <main className="min-h-screen">
      <VideoHero
        videoSrc={heroVideoSrc}
        className="z-20"
        allowOverflow
        fallbackClassName="bg-zinc-950"
        overlayClassName="bg-gradient-to-b from-black/70 via-black/50 to-zinc-950/90"
        fallbackMedia={heroFallbackImageUrl ? (
          <Image
            src={heroFallbackImageUrl}
            alt=""
            fill
            sizes="100vw"
            className="blur-3xl scale-110 opacity-35 object-cover absolute inset-0 z-0"
            aria-hidden="true"
            priority
          />
        ) : null}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-8 pb-5">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/charts"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/60 bg-black/30 backdrop-blur-sm px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              All charts
            </Link>

            {isValidCountry && (
              <div className="inline-flex items-center gap-2 rounded-full bg-black/30 backdrop-blur-sm px-3 py-1.5 text-sm text-zinc-300">
                <FlagIcon code={currentCountry} size={16} />
                {getCountryName(currentCountry)}
              </div>
            )}
          </div>

          {/* Chart type tabs */}
          <div className="flex gap-1 rounded-xl bg-zinc-800/50 p-1 backdrop-blur-sm">
            {CHART_TABS.map((tab) => (
              <Link
                key={tab.type}
                href={`/charts/${currentCountry}/${tab.type}/latest`}
                className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition ${
                  chartType === tab.type
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          <header>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              <SpotifyIcon size={14} />
              {chartSubtitle(chartType)}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">
              {isValidCountry ? getCountryName(currentCountry) : 'Charts'}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
              {chartDate ? (
                <DatePicker
                  selectedDate={chartDate}
                  availableDates={availableDates}
                  chartType={chartType}
                  onSelect={handleDateSelect}
                  displayText={formatChartDate(chartDate, chartType)}
                />
              ) : (
                <span>Latest chart</span>
              )}
              {totalStreams && (
                <span className="text-zinc-500">· {formatStreams(totalStreams)} filtered streams</span>
              )}
            </div>

            {/* #1 entry info */}
            {loading && isValidCountry ? (
              <HeroHighlightSkeleton />
            ) : heroHighlight && (
              <div data-testid="chart-hero-highlight" className="mt-4 flex min-h-[52px] items-center gap-3">
                {heroHighlight.imageUrl && (
                  <Image
                    src={heroHighlight.imageUrl}
                    alt={heroHighlight.imageAlt}
                    width={48}
                    height={48}
                    className={heroHighlight.imageClassName}
                    priority
                  />
                )}
                <div>
                  <p className="text-xs text-zinc-400">#1 right now</p>
                  <p className="text-sm font-bold text-zinc-100">{heroHighlight.title}</p>
                  <p className="text-xs text-zinc-400">{heroHighlight.subtitle}</p>
                </div>
              </div>
            )}
          </header>

          {/* Filter within chart */}
          {isValidCountry && (loading || hasData) && (
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder={filterPlaceholder}
                disabled={loading}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 pl-10 pr-10 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-zinc-600 disabled:cursor-not-allowed disabled:text-zinc-500 disabled:opacity-80"
              />
              {filterQuery && !loading && (
                <button
                  onClick={() => setFilterQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </VideoHero>

      {!isValidCountry && (
        <div className="mx-auto mt-8 w-full max-w-3xl px-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-400">
            Unknown market.
          </div>
        </div>
      )}

      {error && isValidCountry && (
        <div className="mx-auto mt-6 w-full max-w-3xl px-4">
          <div className="text-center space-y-3 py-12">
            <p className="text-zinc-400 text-sm">Couldn&apos;t load chart data right now.</p>
            <button onClick={() => window.location.reload()} className="text-sm text-zinc-500 hover:text-zinc-200 transition underline">Try again</button>
          </div>
        </div>
      )}

      {isValidCountry && !error && (
        <section className="mx-auto mt-0 w-full max-w-3xl min-h-0 px-0 sm:px-4">
          <div className="overflow-hidden rounded-none border-y border-zinc-800/60 sm:rounded-2xl sm:border">
            {/* Column header */}
            <div className="flex items-center gap-3 border-b border-zinc-700/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <span className="w-8 shrink-0 text-center">#</span>
              <span className="flex-1">{chartType === 'artists' ? 'Artist' : chartType === 'albums' ? 'Album' : 'Song'}</span>
              {chartType === 'songs' && (
                <span className="w-16 shrink-0 text-right">{columnHeader}</span>
              )}
            </div>

            {loading
              ? Array.from({ length: 20 }).map((_, index) => <SkeletonRow key={index} index={index} />)
              : chartType === 'songs'
                ? filteredSongs.length === 0
                  ? (
                    <div className="px-4 py-8 text-center text-sm text-zinc-500">
                      {filterQuery.trim()
                        ? <>No matches for &ldquo;{filterQuery.trim()}&rdquo; in this chart.</>
                        : 'No data available for this date.'}
                    </div>
                  )
                  : filteredSongs.map((song, index) => (
                    <ChartRowExpandable
                      key={song.uri}
                      song={song}
                      index={index}
                      isExpanded={expandedUri === song.uri}
                      onToggle={() => setExpandedUri(expandedUri === song.uri ? null : song.uri)}
                      ytLinks={ytLinksMap[song.uri]}
                      striped
                    />
                  ))
                : chartType === 'artists'
                  ? filteredArtists.length === 0
                    ? (
                      <div className="px-4 py-8 text-center text-sm text-zinc-500">
                        {filterQuery.trim()
                          ? <>No matches for &ldquo;{filterQuery.trim()}&rdquo; in this chart.</>
                          : 'No data available for this date.'}
                      </div>
                    )
                    : filteredArtists.map((entry, index) => (
                      <ArtistChartRow key={entry.uri} entry={entry} index={index} striped />
                    ))
                  : filteredAlbums.length === 0
                    ? (
                      <div className="px-4 py-8 text-center text-sm text-zinc-500">
                        {filterQuery.trim()
                          ? <>No matches for &ldquo;{filterQuery.trim()}&rdquo; in this chart.</>
                          : 'No data available for this date.'}
                      </div>
                    )
                    : filteredAlbums.map((entry, index) => (
                      <AlbumChartRow key={entry.uri} entry={entry} index={index} striped />
                    ))
            }
          </div>
        </section>
      )}
    </main>
  );
}
