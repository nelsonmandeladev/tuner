import { FavouriteIcon, PlayIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { resumeFrom, resumeProgress, splitTitleYear, yearOf } from "@tuner/core";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { formatPosition } from "../../app/format";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { loadMovie, setItemFavorite, type MovieDetail as Detail } from "../../data/details";
import { useAsync } from "../../hooks/useAsync";
import { enterPlayer } from "../../player/fullscreen";
import { playVod } from "../../player/tuner";
import { Hero, HeroMeta } from "./Hero";

/**
 * Movie detail (SPEC §5): backdrop, poster, year, duration, genre, rating,
 * plot, cast, Play / Resume and favorite. Built in Series.dc.html's hero.
 */
export function MovieDetail() {
  const { id } = useParams();
  const movieId = Number(id);
  const navigate = useNavigate();
  const state = useAsync(() => loadMovie(movieId), String(movieId));

  if (state.status === "loading") return <div className="h-full" aria-busy />;
  if (state.status === "error" || !state.value) {
    return (
      <Screen title="Movie">
        <EmptyState
          message="This movie is not in your library any more."
          action={<Button onClick={() => void navigate("/movies")}>Back to Movies</Button>}
        />
      </Screen>
    );
  }
  return <MovieView detail={state.value} onBack={() => void navigate(-1)} />;
}

function MovieView({ detail, onBack }: { detail: Detail; onBack: () => void }) {
  const navigate = useNavigate();
  const { item, info, resume } = detail;
  const [favorite, setFavorite] = useState(detail.favorite);
  const { title, year, tags } = splitTitleYear(item.name);
  const start = resumeFrom(resume);
  const minutes = info?.durationSecs ? Math.round(info.durationSecs / 60) : null;
  const rating = info?.rating ?? item.rating;

  const play = (from: number | null) => {
    const loading = playVod(
      {
        kind: "vod",
        id: item.id,
        ext: info?.ext ?? item.ext,
        title,
        detail: year ? String(year) : "",
        series: null,
      },
      { start: from, returnTo: `/movies/${item.id}` },
    );
    void enterPlayer(navigate, loading);
  };

  return (
    <div className="flex flex-col" data-movie={item.id}>
      <Hero
        name={title}
        backdrop={info?.backdrop ?? null}
        poster={info?.poster ?? item.icon}
        backLabel="Back"
        onBack={onBack}
      >
        <HeroMeta
          parts={[
            { text: String(yearOf(info?.releaseDate ?? null) ?? year ?? ""), mono: true },
            { text: info?.genre ?? "" },
            {
              text: minutes
                ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
                : "",
              mono: true,
            },
            { text: rating ? `★ ${rating.toFixed(1)}` : "", mono: true },
            ...tags.map((text) => ({ text })),
          ]}
        />
        <h1 className="font-display text-display-xl" data-detail-title>
          {title}
        </h1>
        {info?.plot && (
          <p className="line-clamp-4 max-w-135 text-body-l text-text-2">{info.plot}</p>
        )}
        {!info && (
          <p className="text-caption text-text-dim">
            Details are not available right now. You can still play the movie.
          </p>
        )}
        {start !== null && (
          <div className="flex max-w-90 items-center gap-3">
            <ProgressBar
              value={resumeProgress(resume)}
              tone="media"
              thumb={false}
              className="flex-1"
            />
            <span className="font-mono text-caption text-text-2">{formatPosition(start)}</span>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-3">
          <Button onClick={() => play(start)}>
            <Icon icon={PlayIcon} size={16} className="[&_path]:fill-current" />
            {start !== null ? "Resume" : "Play"}
          </Button>
          {start !== null && (
            <Button variant="ghost" onClick={() => play(null)}>
              <Icon icon={RefreshIcon} size={16} />
              Start over
            </Button>
          )}
          <button
            type="button"
            aria-label={favorite ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
            aria-pressed={favorite}
            data-favorite
            onClick={() => {
              setFavorite(!favorite);
              void setItemFavorite("vod", item.id, !favorite);
            }}
            className={`flex size-12 items-center justify-center rounded-button bg-ghost transition-colors duration-(--duration-hover) hover:bg-ghost-strong ${
              favorite ? "text-accent" : "text-text"
            }`}
          >
            <Icon icon={FavouriteIcon} className={favorite ? "[&_path]:fill-current" : ""} />
          </button>
        </div>
      </Hero>

      {(info?.director || info?.cast) && (
        <section
          aria-label="Credits"
          className="grid max-w-200 grid-cols-[auto_1fr] gap-x-8 gap-y-3 px-12 pt-2 pb-12 text-small"
        >
          {info.director && (
            <>
              <span className="text-text-dim">Director</span>
              <span className="text-text-2">{info.director}</span>
            </>
          )}
          {info.cast && (
            <>
              <span className="text-text-dim">Cast</span>
              <span className="text-text-2">{info.cast}</span>
            </>
          )}
        </section>
      )}
    </div>
  );
}
