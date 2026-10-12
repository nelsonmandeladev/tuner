import { PlayIcon } from "@hugeicons/core-free-icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  episodeToPlay,
  resumeFrom,
  resumeProgress,
  sortEpisodes,
  episodeTitle,
  splitTitleYear,
  yearOf,
  type Episode,
  type ResumePoint,
} from "@tuner/core";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { formatLeft } from "../../app/format";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { FavoriteButton } from "../../components/FavoriteButton";
import { Icon } from "../../components/Icon";
import { Screen } from "../../components/Screen";
import { SegmentedControl } from "../../components/SegmentedControl";
import { artworkUrl } from "../../data/artwork";
import {
  loadSeries,
  readAutoplayNext,
  writeAutoplayNext,
  type SeriesDetail as Detail,
} from "../../data/details";
import { useAsync } from "../../hooks/useAsync";
import { enterPlayer } from "../../player/fullscreen";
import { playVod } from "../../player/tuner";
import { episodeMedia } from "../../player/vodSession";
import { Hero, HeroMeta } from "./Hero";

/** Episode row: 12 px padding around a 168 × 94.5 thumbnail, plus 4 px between rows (Series.dc.html). */
const ROW = 119 + 4;

/** Series detail (SPEC §6, design/screens/Series.dc.html): seasons, episodes, resume, next episode. */
export function SeriesDetail() {
  const { id } = useParams();
  const seriesId = Number(id);
  const navigate = useNavigate();
  const state = useAsync(() => loadSeries(seriesId), String(seriesId));

  if (state.status === "loading") return <div className="h-full" aria-busy />;
  if (state.status === "error" || !state.value) {
    return (
      <Screen title="Series">
        <EmptyState
          message="This series is not in your library any more."
          action={<Button onClick={() => void navigate("/series")}>Back to Series</Button>}
        />
      </Screen>
    );
  }
  return <SeriesView detail={state.value} onBack={() => void navigate(-1)} />;
}

function code(episode: Episode) {
  return [
    episode.season !== null ? `S${episode.season}` : null,
    episode.episodeNum !== null ? `E${episode.episodeNum}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SeriesView({ detail, onBack }: { detail: Detail; onBack: () => void }) {
  const navigate = useNavigate();
  const { item, info, resume } = detail;
  const { title, tags } = splitTitleYear(item.name);
  const episodes = useMemo(() => sortEpisodes(info?.episodes ?? []), [info]);
  const offer = useMemo(() => episodeToPlay(episodes, resume), [episodes, resume]);
  const seasons = useMemo(
    () => [...new Set(episodes.map((e) => e.season ?? 0))].sort((a, b) => a - b),
    [episodes],
  );
  const [season, setSeason] = useState<number>(offer?.episode.season ?? seasons[0] ?? 0);
  const [autoplay, setAutoplay] = useState(true);
  useEffect(() => {
    void readAutoplayNext().then(setAutoplay);
  }, []);

  const series = { id: item.id, name: title, episodes };
  const play = (episode: Episode, point: ResumePoint | undefined) => {
    const loading = playVod(episodeMedia(series, episode), {
      start: resumeFrom(point),
      returnTo: `/series/${item.id}`,
    });
    void enterPlayer(navigate, loading);
  };

  const seasonCount = seasons.length;
  return (
    <div className="flex flex-col" data-series={item.id}>
      <Hero
        name={title}
        backdrop={item.backdrop}
        poster={item.cover}
        backLabel="Back"
        onBack={onBack}
      >
        <HeroMeta
          parts={[
            { text: String(yearOf(item.releaseDate) ?? ""), mono: true },
            { text: item.genre ?? "" },
            { text: seasonCount ? `${seasonCount} season${seasonCount === 1 ? "" : "s"}` : "" },
            { text: item.rating ? `★ ${item.rating.toFixed(1)}` : "", mono: true },
            ...tags.map((text) => ({ text })),
          ]}
        />
        <h1 className="font-display text-display-xl" data-detail-title>
          {title}
        </h1>
        {item.plot && <p className="line-clamp-4 max-w-135 text-body-l text-text-2">{item.plot}</p>}
        <div className="mt-1.5 flex flex-wrap gap-3">
          {offer && (
            <Button
              onClick={() => play(offer.episode, resume.get(offer.episode.id))}
              data-play-offer
            >
              <Icon icon={PlayIcon} size={16} className="[&_path]:fill-current" />
              {offer.resume ? "Resume" : "Play"} {code(offer.episode)}
            </Button>
          )}
          <FavoriteButton kind="series" id={item.id} name={title} tone="media" />
        </div>
      </Hero>

      <section aria-label="Episodes" className="flex flex-col gap-5 px-12 pt-2 pb-12">
        {!info ? (
          <EmptyState message="The episodes could not be loaded. Check the connection and open the series again." />
        ) : episodes.length === 0 ? (
          <EmptyState message="This series has no episodes yet." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SegmentedControl
                label="Season"
                options={seasons.map((s) => ({
                  value: s,
                  label: s === 0 ? "Extras" : `Season ${s}`,
                }))}
                value={season}
                onChange={setSeason}
              />
              <label className="inline-flex items-center gap-2.5 text-small text-text-2">
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(event) => {
                    setAutoplay(event.target.checked);
                    void writeAutoplayNext(event.target.checked);
                  }}
                  className="size-4.5 accent-accent"
                  data-autoplay
                />
                Play next episode automatically
              </label>
            </div>
            <EpisodeList
              seriesTitle={title}
              episodes={episodes.filter((e) => (e.season ?? 0) === season)}
              resume={resume}
              currentId={offer?.episode.id ?? null}
              onPlay={play}
            />
          </>
        )}
      </section>
    </div>
  );
}

/**
 * A season's episodes, virtualised against the page's scroll container
 * (long-running shows list hundreds in one season; CLAUDE.md rule 10).
 */
function EpisodeList({
  episodes,
  seriesTitle,
  resume,
  currentId,
  onPlay,
}: {
  episodes: Episode[];
  seriesTitle: string;
  resume: Map<number, ResumePoint>;
  currentId: number | null;
  onPlay: (episode: Episode, point: ResumePoint | undefined) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const scroller = () => list.current?.closest("main") ?? null;

  useLayoutEffect(() => {
    const main = list.current?.closest("main");
    if (list.current && main) {
      setScrollMargin(
        list.current.getBoundingClientRect().top -
          main.getBoundingClientRect().top +
          main.scrollTop,
      );
    }
  }, []);

  const virtualizer = useVirtualizer({
    count: episodes.length,
    getScrollElement: scroller,
    estimateSize: () => ROW,
    overscan: 4,
    scrollMargin,
    useFlushSync: false,
  });

  return (
    <div ref={list} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const episode = episodes[row.index]!;
        return (
          <div
            key={episode.id}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${row.start - scrollMargin}px)` }}
          >
            <EpisodeRow
              episode={episode}
              seriesTitle={seriesTitle}
              point={resume.get(episode.id)}
              current={episode.id === currentId}
              onPlay={onPlay}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * DESIGN.md `EpisodeRow`: 16:9 thumbnail 168 wide with progress along its
 * bottom, "n. Title", plot, duration (mono), state ("Watched", "11 min left"
 * in accent).
 */
const EpisodeRow = memo(function EpisodeRow({
  episode,
  seriesTitle,
  point,
  current,
  onPlay,
}: {
  episode: Episode;
  seriesTitle: string;
  point: ResumePoint | undefined;
  current: boolean;
  onPlay: (episode: Episode, point: ResumePoint | undefined) => void;
}) {
  const image = artworkUrl(episode.image);
  const [failed, setFailed] = useState(false);
  const progress = resumeProgress(point);
  const inProgress = !!point && !point.watched && resumeFrom(point) !== null;
  const duration = episode.durationSecs ?? point?.durationSecs ?? null;
  const left = inProgress && duration ? duration - point.positionSecs : null;

  return (
    <button
      type="button"
      onClick={() => onPlay(episode, point)}
      data-episode={episode.id}
      className={`flex h-29.75 w-full items-center gap-5 rounded-poster p-3 text-left text-text transition-colors duration-(--duration-hover) ease-out ${
        current ? "bg-surface-selected" : "hover:bg-surface"
      }`}
    >
      <span className="relative aspect-video w-42 flex-none overflow-hidden rounded-field bg-surface">
        {image && !failed ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="absolute -top-[30%] -right-[20%] aspect-square w-[70%] rounded-full bg-art-glow" />
        )}
        <span className="absolute bottom-2 left-2.5 font-mono text-mono text-text/85">
          {code(episode)}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-0.75 bg-track-on-media">
          <span
            className="block h-full bg-accent"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-body-l font-semibold">
          {episode.episodeNum !== null ? `${episode.episodeNum}. ` : ""}
          {episodeTitle(episode.title, seriesTitle) ?? code(episode)}
        </span>
        {episode.plot && (
          <span className="line-clamp-2 max-w-160 text-small text-text-muted">{episode.plot}</span>
        )}
      </span>
      <span className="flex min-w-30 flex-none flex-col items-end gap-1.5">
        {duration && (
          <span className="font-mono text-caption text-text-muted">
            {Math.round(duration / 60)} min
          </span>
        )}
        {point?.watched ? (
          <span className="text-mono font-semibold text-text-dim">Watched</span>
        ) : left !== null ? (
          <span className="text-mono font-semibold text-accent">
            {formatLeft(left * 1000)} left
          </span>
        ) : null}
      </span>
    </button>
  );
});
