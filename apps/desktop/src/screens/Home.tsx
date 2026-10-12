import { PlayIcon } from "@hugeicons/core-free-icons";
import { episodeTitle, resumeProgress, splitTitleYear, type InProgress } from "@tuner/core";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useNavigate, type NavigateFunction } from "react-router";
import { formatLeft } from "../app/format";
import { Button } from "../components/Button";
import { Carousel, CarouselArrows } from "../components/Carousel";
import { ChannelCard } from "../components/ChannelCard";
import { EmptyState } from "../components/EmptyState";
import { GeneratedArt } from "../components/GeneratedArt";
import { Icon } from "../components/Icon";
import { PosterCard } from "../components/PosterCard";
import { ProgressBar } from "../components/ProgressBar";
import { Screen } from "../components/Screen";
import { artworkUrl } from "../data/artwork";
import { ALL, movies, series, type PosterItem } from "../data/catalog";
import { useNow, wantEpg } from "../data/epg";
import {
  CHANNELS_PER_ROW,
  loadHome,
  markHomePainted,
  resumeTarget,
  useHome,
  type HomeHero,
} from "../data/home";
import { clearReveal, FAVORITES, loadLive, revealChannel, selectCategory } from "../data/live";
import { useSession } from "../data/session";
import { useCarouselControls } from "../hooks/useCarouselControls";
import { enterPlayer } from "../player/fullscreen";
import { playVod, tune } from "../player/tuner";

/** Live TV loads in the background this long after Home paints, so a channel card opens at once. */
const PRELOAD_LIVE_MS = 2500;

/**
 * Home (SPEC §2, design/screens/Main.dc.html): the latest movie or episode in
 * progress as a hero with Resume, favorite channels with what is on now,
 * Continue watching, recently watched channels, and what was added recently.
 * A fresh account sees one line per empty row saying what will appear there.
 */
export function Home() {
  const navigate = useNavigate();
  const status = useHome((s) => s.status);
  const hero = useHome((s) => s.hero);
  const continueWatching = useHome((s) => s.continueWatching);
  const favoriteChannels = useHome((s) => s.favoriteChannels);
  const recentChannels = useHome((s) => s.recentChannels);
  const recentMovies = useHome((s) => s.recentMovies);
  const recentSeries = useHome((s) => s.recentSeries);
  const counts = useSession((s) => s.counts);
  const accountId = useSession((s) => s.active?.id);
  const syncing = useSession((s) => s.sync.running);
  const now = useNow();

  useEffect(() => {
    void loadHome();
  }, [accountId, syncing]);

  useLayoutEffect(() => {
    if (status === "ready") requestAnimationFrame(markHomePainted);
  }, [status]);

  useEffect(() => {
    const timer = setTimeout(() => void loadLive(), PRELOAD_LIVE_MS);
    return () => clearTimeout(timer);
  }, []);

  // What is on now, for the cards on screen: the favorites in view (and the
  // next page, so paging shows programmes at once) and the recent channels.
  const favorites = useCarouselControls();
  const [inView, setInView] = useState<[number, number]>([0, CHANNELS_PER_ROW - 1]);
  const onVisible = useCallback(
    (first: number, last: number) =>
      setInView((v) => (v[0] === first && v[1] === last ? v : [first, last])),
    [],
  );
  useEffect(() => {
    const shown = favoriteChannels.slice(inView[0], inView[1] + 1 + CHANNELS_PER_ROW);
    wantEpg(
      "home",
      [...shown, ...recentChannels].map((c) => c.id),
    );
    return () => wantEpg("home", []);
  }, [favoriteChannels, recentChannels, inView]);

  if (status === "error") {
    return (
      <Screen title="Home">
        <EmptyState
          message="Home could not be read from the local library."
          action={<Button onClick={() => void loadHome()}>Try again</Button>}
        />
      </Screen>
    );
  }
  if (counts && counts.live + counts.vod + counts.series === 0) {
    return (
      <Screen title="Home">
        <EmptyState message="Your channels, movies and series show up here after the first sync." />
      </Screen>
    );
  }
  if (status !== "ready") return <HomeSkeleton />;

  const openChannel = (id: number, fromFavorites: boolean) =>
    void openChannelInPlayer(navigate, id, fromFavorites);
  const resume = (item: InProgress) => void resumeInPlayer(navigate, item);

  return (
    <div className="flex flex-col gap-10 px-10 pb-12" data-home>
      {hero && <Hero hero={hero} onResume={() => resume(hero.item)} />}

      {favoriteChannels.length > 0 && (
        <Row
          title="Favorite channels"
          arrows={<CarouselArrows controls={favorites.controls} label="favorite channels" />}
          link={{
            label: "Open Live TV",
            onClick: () =>
              void loadLive().then(() => {
                selectCategory(FAVORITES);
                void navigate("/live");
              }),
          }}
        >
          <Carousel
            perPage={CHANNELS_PER_ROW}
            row="favorite-channels"
            onControls={favorites.onControls}
            onVisible={onVisible}
          >
            {favoriteChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                now={now}
                onOpen={(id) => openChannel(id, true)}
              />
            ))}
          </Carousel>
        </Row>
      )}

      {continueWatching.length > 0 && (
        <Row title="Continue watching">
          <div className="grid grid-cols-6 gap-3.5" data-row="continue-watching">
            {continueWatching.map((item) => (
              <PosterCard
                key={`${item.kind}:${item.id}`}
                item={posterOf(item)}
                progress={resumeProgress(item.point)}
                caption={captionOf(item)}
                focused
                onOpen={() => resume(item)}
                onFocus={noop}
              />
            ))}
          </div>
        </Row>
      )}

      {recentChannels.length > 0 && (
        <Row title="Recently watched channels">
          <div className="grid grid-cols-5 gap-3.5" data-row="recent-channels">
            {recentChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                now={now}
                onOpen={(id) => openChannel(id, false)}
              />
            ))}
          </div>
        </Row>
      )}

      <PosterRow
        title="Recently added movies"
        items={recentMovies}
        row="recent-movies"
        onSeeAll={() => {
          movies.openWith({ categoryId: ALL, sort: "recent" });
          void navigate("/movies");
        }}
        onOpen={(id) => void navigate(`/movies/${id}`)}
      />
      <PosterRow
        title="Recently added series"
        items={recentSeries}
        row="recent-series"
        onSeeAll={() => {
          series.openWith({ categoryId: ALL, sort: "recent" });
          void navigate("/series");
        }}
        onOpen={(id) => void navigate(`/series/${id}`)}
      />
    </div>
  );
}

const noop = () => undefined;

/** Main.dc.html's hero: art under a left-to-right scrim, then eyebrow, title, detail, progress, actions. */
function Hero({ hero, onResume }: { hero: HomeHero; onResume: () => void }) {
  const navigate = useNavigate();
  const { item } = hero;
  const title = splitTitleYear(item.kind === "vod" ? item.movie.name : item.series.name).title;
  const year = item.kind === "vod" ? splitTitleYear(item.movie.name).year : null;
  const detail =
    item.kind === "episode"
      ? [
          item.episode.season !== null ? `Season ${item.episode.season}` : null,
          item.episode.episodeNum !== null ? `Episode ${item.episode.episodeNum}` : null,
          episodeTitle(item.episode.title, title),
        ]
      : [year ? String(year) : null, hero.genre];
  const left = timeLeft(item);
  const backdrop = artworkUrl(hero.backdrop);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <section
      aria-label="Continue watching"
      className="relative h-110 flex-none overflow-hidden rounded-hero"
      data-hero={`${item.kind}:${item.id}`}
    >
      {backdrop && failed !== backdrop ? (
        <img
          src={backdrop}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(backdrop)}
        />
      ) : (
        <GeneratedArt name={title} variant="hero" className="absolute inset-0" />
      )}
      <div className="absolute inset-0 bg-(image:--scrim-home)" />
      <div className="relative flex h-full max-w-155 flex-col justify-end gap-4 px-11 py-10">
        <span className="text-eyebrow text-accent uppercase">Continue watching</span>
        <h1 className="line-clamp-2 font-display text-display-l" data-hero-title>
          {title}
        </h1>
        <p className="truncate text-body-l text-text-2">{detail.filter(Boolean).join(" · ")}</p>
        <div className="flex max-w-90 items-center gap-3">
          <ProgressBar
            value={resumeProgress(item.point)}
            tone="media"
            thumb={false}
            className="flex-1"
          />
          {left && <span className="font-mono text-caption text-text-2">{left}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          <Button onClick={onResume} data-hero-resume>
            <Icon icon={PlayIcon} size={16} className="[&_path]:fill-current" />
            Resume
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              void navigate(
                item.kind === "vod" ? `/movies/${item.id}` : `/series/${item.series.id}`,
              )
            }
          >
            {item.kind === "vod" ? "Details" : "All episodes"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** A heading with an optional link on the right, then the row (Main.dc.html sections). */
function Row({
  title,
  link,
  arrows,
  children,
}: {
  title: string;
  link?: { label: string; onClick: () => void };
  /** Previous/next buttons beside the title (a carousel row). */
  arrows?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-4">
          <h2 className="text-heading">{title}</h2>
          {arrows}
        </span>
        {link && (
          <button
            type="button"
            onClick={link.onClick}
            className="text-small font-medium text-accent transition-colors duration-(--duration-hover) hover:text-accent-hover"
          >
            {link.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function PosterRow({
  title,
  items,
  row,
  onSeeAll,
  onOpen,
}: {
  title: string;
  items: PosterItem[];
  row: string;
  onSeeAll: () => void;
  onOpen: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Row title={title} link={{ label: "See all", onClick: onSeeAll }}>
      <div className="grid grid-cols-6 gap-3.5" data-row={row}>
        {items.map((item) => (
          <PosterCard key={item.id} item={item} focused onOpen={onOpen} onFocus={noop} />
        ))}
      </div>
    </Row>
  );
}

/** Loading (DESIGN.md "States"): the hero and a row of cards in their final shapes. */
function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-10 px-10 pb-12" aria-busy aria-label="Loading Home">
      <div className="h-110 rounded-hero bg-surface" />
      <div className="flex flex-col gap-4">
        <div className="h-6.5 w-52 rounded-full bg-surface" />
        <div className="grid grid-cols-5 gap-3.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-card bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}

function timeLeft(item: InProgress): string | null {
  const duration = item.point.durationSecs;
  return duration ? `${formatLeft((duration - item.point.positionSecs) * 1000)} left` : null;
}

function posterOf(item: InProgress): PosterItem {
  if (item.kind === "vod") {
    const { title, year } = splitTitleYear(item.movie.name);
    return {
      id: item.id,
      name: item.movie.name,
      title,
      year,
      image: item.movie.icon,
      rating: item.movie.rating,
      addedAt: item.movie.addedAt,
      genre: null,
      ext: item.movie.ext,
    };
  }
  const { title } = splitTitleYear(item.series.name);
  return {
    id: item.id,
    name: item.series.name,
    title,
    year: null,
    image: item.series.cover,
    rating: null,
    addedAt: null,
    genre: null,
    ext: item.episode.ext,
  };
}

function captionOf(item: InProgress): { left: string; right: string | null } {
  const left =
    item.kind === "episode"
      ? [
          item.episode.season !== null ? `S${item.episode.season}` : null,
          item.episode.episodeNum !== null ? `E${item.episode.episodeNum}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Movie";
  return { left, right: timeLeft(item) };
}

/** A channel card: plays full screen; zapping walks the favorites (or the channel's category). */
async function openChannelInPlayer(navigate: NavigateFunction, id: number, fromFavorites: boolean) {
  await loadLive();
  if (fromFavorites) selectCategory(FAVORITES);
  const list = revealChannel(id);
  clearReveal();
  tune(id, { list });
  await enterPlayer(navigate);
}

async function resumeInPlayer(navigate: NavigateFunction, item: InProgress) {
  const { media, options } = await resumeTarget(item);
  await enterPlayer(navigate, playVod(media, options));
}
