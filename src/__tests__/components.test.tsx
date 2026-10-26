import type React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AlbumChartRow, type AlbumChartEntry } from '@/components/AlbumChartRow';
import { ArtistChartRow, type ArtistChartEntry } from '@/components/ArtistChartRow';
import { AlbumThumb, ChangeIndicator, ChartRowExpandable, type ChartEntry } from '@/components/ChartRow';
import { DatePicker } from '@/components/DatePicker';
import { ImageModal } from '@/components/ImageModal';
import { SpotifyIcon, YouTubeIcon, YouTubeMusicIcon } from '@/components/PlatformIcons';
import { VideoHero } from '@/components/VideoHero';
import { useInView } from '@/hooks/useInView';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type MockImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  fill?: boolean;
  priority?: boolean;
  src: string | { src: string };
};

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, fill: _fill, priority: _priority, src, ...props }: MockImageProps) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={typeof src === 'string' ? src : src.src} {...props} />
  ),
}));

const song: ChartEntry = {
  rank: 3,
  uri: 'spotify:track:song-1',
  track_name: 'Midnight Signal',
  artist_names: 'Nova|Echo',
  artist_uris: 'spotify:artist:nova|spotify:artist:echo',
  image_url: 'https://i.scdn.co/image/song.jpg',
  label: 'Public Label',
  streams: 1_250_000,
  peak_rank: 1,
  previous_rank: 5,
  days_on_chart: 12,
  consecutive_days: 4,
  entry_status: 'STANDARD',
  peak_date: '2026-04-18',
  entry_rank: 20,
  entry_date: '2026-04-01',
  release_date: '2026-03-01',
};

const album: AlbumChartEntry = {
  rank: 2,
  uri: 'spotify:album:album-1',
  album_name: 'Static Bloom',
  artist_names: 'Nova|Echo',
  artist_uris: 'spotify:artist:nova|spotify:artist:echo',
  image_url: '',
  label: 'Public Label',
  peak_rank: 1,
  previous_rank: 0,
  weeks_on_chart: 1,
  consecutive_weeks: 1,
  entry_status: 'NEW_ENTRY',
  peak_date: '2026-04-16',
  entry_rank: 2,
  entry_date: '2026-04-16',
  release_date: '2026-04-01',
};

const artist: ArtistChartEntry = {
  rank: 4,
  uri: 'spotify:artist:artist-1',
  artist_name: 'Nova',
  image_url: 'https://i.scdn.co/image/artist.jpg',
  peak_rank: 3,
  previous_rank: 2,
  days_on_chart: 18,
  consecutive_days: 7,
  entry_status: 'STANDARD',
  peak_date: '2026-04-14',
  entry_rank: 12,
  entry_date: '2026-04-01',
};

describe('chart rows', () => {
  it('renders album chart rows with fallback artwork and chart metadata', () => {
    render(<AlbumChartRow entry={album} index={0} striped />);

    expect(screen.getByRole('link', { name: /static bloom/i })).toHaveAttribute('href', '/album/album-1');
    expect(screen.getByText('Nova, Echo')).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.getByText(/1 wk/)).toBeInTheDocument();
  });

  it('renders artist chart rows with links and movement metadata', () => {
    render(<ArtistChartRow entry={artist} index={1} />);

    expect(screen.getByRole('link', { name: /nova/i })).toHaveAttribute('href', '/artist/artist-1');
    expect(screen.getByRole('img', { name: 'Nova' })).toHaveAttribute('src', artist.image_url);
    expect(screen.getByText('▼2')).toBeInTheDocument();
    expect(screen.getByText(/18 days on chart/)).toBeInTheDocument();
  });

  it('renders collapsed and expanded song rows', () => {
    const onToggle = jest.fn();
    render(
      <ChartRowExpandable
        song={song}
        index={0}
        isExpanded
        onToggle={onToggle}
        ytLinks={{ m: 'music-id', v: 'video-id', vt: 'OMV' }}
      />,
    );

    fireEvent.click(screen.getAllByText('Midnight Signal')[0]);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /song page/i })).toHaveAttribute('href', '/song/song-1');
    expect(screen.getByTitle('Spotify')).toHaveAttribute('href', 'https://open.spotify.com/track/song-1');
    expect(screen.getByTitle('Music Video')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=video-id');
    expect(screen.getByTitle('YouTube Music')).toHaveAttribute('href', 'https://music.youtube.com/watch?v=music-id');
  });

  it('covers song movement indicators and empty artwork fallback', () => {
    const { rerender } = render(<ChangeIndicator entry={{ ...song, entry_status: 'RE_ENTRY' }} />);

    expect(screen.getByText('RE')).toBeInTheDocument();

    rerender(<ChangeIndicator entry={{ ...song, entry_status: 'STANDARD', rank: 5, previous_rank: 5 }} />);
    expect(screen.getByText('=')).toBeInTheDocument();

    render(<AlbumThumb src="" alt="Missing cover" size={40} />);
    expect(screen.getByText('=')).toBeInTheDocument();
  });
});

describe('DatePicker', () => {
  it('selects available song dates and ignores unavailable dates', () => {
    const onSelect = jest.fn();
    render(
      <DatePicker
        selectedDate="2026-04-20"
        availableDates={new Set(['2026-04-20'])}
        chartType="songs"
        onSelect={onSelect}
        displayText="Apr 20"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /apr 20/i }));
    fireEvent.click(screen.getByRole('button', { name: '21' }));
    fireEvent.click(screen.getByRole('button', { name: '20' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-04-20');
  });

  it('maps album calendar clicks to the available chart week', () => {
    const onSelect = jest.fn();
    render(
      <DatePicker
        selectedDate="2026-04-16"
        availableDates={new Set(['2026-04-16'])}
        chartType="albums"
        onSelect={onSelect}
        displayText="Apr 16"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /apr 16/i }));
    fireEvent.click(screen.getByRole('button', { name: '15' }));

    expect(onSelect).toHaveBeenCalledWith('2026-04-16');
  });

  it('renders the calendar popover out of normal layout flow', () => {
    render(
      <DatePicker
        selectedDate="2026-04-20"
        availableDates={new Set(['2026-04-20'])}
        chartType="songs"
        onSelect={jest.fn()}
        displayText="Apr 20"
      />,
    );

    const trigger = screen.getByRole('button', { name: /apr 20/i });
    const wrapper = trigger.parentElement;

    expect(wrapper).toHaveClass('relative');

    fireEvent.click(trigger);

    const panel = screen.getByText('April 2026').parentElement?.parentElement;
    expect(panel).toHaveClass('absolute', 'left-0', 'top-full', 'z-[100]');
  });
});

describe('modal, icons and video hero', () => {
  it('renders the image modal at document body level so page chrome cannot clip it', () => {
    render(
      <div data-testid="nested-host">
        <ImageModal src="/cover.jpg" alt="Cover" onClose={jest.fn()} />
      </div>,
    );

    const modal = screen.getByRole('img', { name: 'Cover' }).closest('div');

    expect(modal).toHaveClass('fixed', 'inset-0');
    expect(modal?.parentElement).toBe(document.body);
    expect(screen.getByTestId('nested-host')).toBeEmptyDOMElement();
  });

  it('closes the image modal from backdrop and Escape, but not image clicks', () => {
    const onClose = jest.fn();
    render(<ImageModal src="/cover.jpg" alt="Cover" onClose={onClose} />);

    fireEvent.click(screen.getByRole('img', { name: 'Cover' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders platform icons with custom sizing', () => {
    const { container } = render(
      <div>
        <SpotifyIcon size={20} />
        <YouTubeIcon size={22} />
        <YouTubeMusicIcon size={24} />
      </div>,
    );

    expect(container.querySelector('svg[width="20"]')).toBeInTheDocument();
    expect(container.querySelector('svg[width="22"]')).toBeInTheDocument();
    expect(container.querySelector('svg[width="24"]')).toBeInTheDocument();
  });

  it('renders a video hero and falls back after video errors', () => {
    render(
      <VideoHero
        videoSrc="/hero.mp4"
        label="Hero"
        fallbackMedia={
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/cover.jpg" alt="Fallback cover" />
        }
      >
        <h1>Now Playing</h1>
      </VideoHero>,
    );

    const section = screen.getByLabelText('Hero');
    const video = section.querySelector('video');

    expect(screen.getByText('Now Playing')).toBeInTheDocument();
    expect(video).toHaveAttribute('src', '/hero.mp4');

    fireEvent.error(video as HTMLVideoElement);
    expect(section.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByAltText('Fallback cover')).toBeInTheDocument();
  });

  it('sizes default video background layers to the hero box', () => {
    render(
      <VideoHero videoSrc="/hero.mp4" label="Sized hero" allowOverflow>
        <h1>Chart controls</h1>
      </VideoHero>,
    );

    const section = screen.getByLabelText('Sized hero');
    const video = section.querySelector('video');

    expect(section).toHaveClass('overflow-visible');
    expect(video).toHaveClass('absolute', 'inset-0', 'h-full', 'w-full', 'object-cover');
  });

  it('applies the bottom fade to every video hero by default', () => {
    render(
      <VideoHero label="Fallback hero">
        <h1>Fallback Only</h1>
      </VideoHero>,
    );

    const section = screen.getByLabelText('Fallback hero');

    expect(section).toHaveClass('after:bg-gradient-to-b');
    expect(section).toHaveClass('after:via-zinc-950/75');
    expect(section).toHaveClass('after:to-zinc-950');
    expect(section).toHaveClass('md:after:h-48');
  });

  it('keeps the dark overlay when rendering placeholder media without a video', () => {
    render(
      <VideoHero
        label="Placeholder hero"
        overlayClassName="custom-placeholder-overlay"
        fallbackMedia={
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/cover.jpg" alt="Fallback cover" />
        }
      >
        <h1>Placeholder Only</h1>
      </VideoHero>,
    );

    const section = screen.getByLabelText('Placeholder hero');

    expect(section.querySelector('video')).not.toBeInTheDocument();
    expect(section.querySelector('.custom-placeholder-overlay')).toHaveClass('pointer-events-none');
  });

  it('clips placeholder media even when the hero allows popovers to overflow', () => {
    render(
      <VideoHero
        label="Overflow hero"
        allowOverflow
        fallbackMedia={
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/cover.jpg" alt="Scaled fallback cover" className="scale-110 blur-3xl" />
        }
      >
        <h1>Chart controls</h1>
      </VideoHero>,
    );

    const section = screen.getByLabelText('Overflow hero');
    const fallbackLayer = screen.getByAltText('Scaled fallback cover').parentElement;

    expect(section).toHaveClass('overflow-visible');
    expect(fallbackLayer).toHaveClass('overflow-hidden');
  });
});

describe('useInView', () => {
  let callback: IntersectionObserverCallback = () => {};
  const disconnectMock = jest.fn();
  const observeMock = jest.fn();

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0.1];
    disconnect = disconnectMock;
    observe = observeMock;
    takeRecords = jest.fn(() => []);
    unobserve = jest.fn();

    constructor(cb: IntersectionObserverCallback) {
      callback = cb;
    }
  }

  function Probe({ once = true }: { once?: boolean }) {
    const [ref, isInView] = useInView<HTMLDivElement>({ once });
    return (
      <div>
        <span>{isInView ? 'visible' : 'hidden'}</span>
        <div ref={ref}>target</div>
      </div>
    );
  }

  beforeEach(() => {
    disconnectMock.mockClear();
    observeMock.mockClear();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  it('observes an element and disconnects after the first intersection by default', () => {
    render(<Probe />);

    expect(observeMock).toHaveBeenCalledWith(screen.getByText('target'));

    act(() => {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(screen.getByText('visible')).toBeInTheDocument();
    expect(disconnectMock).toHaveBeenCalled();
  });

  it('can return to hidden when once is disabled', () => {
    render(<Probe once={false} />);

    act(() => {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    act(() => {
      callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(screen.getByText('hidden')).toBeInTheDocument();
  });
});
