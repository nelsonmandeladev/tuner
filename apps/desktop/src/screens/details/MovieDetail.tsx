import { PlayIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { resumeFrom, resumeProgress, splitTitleYear, yearOf } from "@tuner/core";
import { useNavigate, useParams } from "react-router";
import { formatPosition } from "../../app/format";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Carousel, CarouselArrows } from "../../components/Carousel";
import { FavoriteButton } from "../../components/FavoriteButton";
import { PersonAvatar } from "../../components/PersonAvatar";
import { PosterCard } from "../../components/PosterCard";
import { useCarouselControls } from "../../hooks/useCarouselControls";
import { Icon } from "../../components/Icon";
import { ProgressBar } from "../../components/ProgressBar";
import { Screen } from "../../components/Screen";
import { loadMovie, loadRelatedMovies, type MovieDetail as Detail } from "../../data/details";
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
          <FavoriteButton kind="vod" id={item.id} name={title} tone="media" />
        </div>
      </Hero>

      <MovieExtras
        id={item.id}
        title={title}
        director={info?.director ?? null}
        cast={info?.cast ?? null}
      />
    </div>
  );
}

/** Names from the provider's comma-separated credits, in order, without repeats. */
function names(list: string | null, max: number): string[] {
  if (!list) return [];
  return [
    ...new Set(
      list
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);
}

/**
 * Below the hero (M5 review): the director and cast as avatars, then movies
 * like this one in a carousel. Either part is left out when it has nothing.
 */
function MovieExtras({
  id,
  title,
  director,
  cast,
}: {
  id: number;
  title: string;
  director: string | null;
  cast: string | null;
}) {
  const navigate = useNavigate();
  const related = useAsync(() => loadRelatedMovies(id, title), String(id));
  const carousel = useCarouselControls();
  const people = [
    ...names(director, 2).map((name) => ({ name, role: "Director" })),
    ...names(cast, 20).map((name) => ({ name, role: undefined })),
  ];
  const posters = related.status === "ready" ? (related.value ?? []) : [];

  return (
    <div className="flex flex-col gap-10 px-12 pt-2 pb-12">
      {people.length > 0 && (
        <section aria-label="Cast and crew" className="flex flex-col gap-4">
          <h2 className="text-heading">Cast and crew</h2>
          <div className="flex [scrollbar-width:none] gap-5 overflow-x-auto" data-row="people">
            {people.map((person) => (
              <PersonAvatar key={`${person.role ?? "cast"}:${person.name}`} {...person} />
            ))}
          </div>
        </section>
      )}
      {posters.length > 0 && (
        <section aria-label="More like this" className="flex flex-col gap-4">
          <span className="flex items-center gap-4">
            <h2 className="text-heading">More like this</h2>
            <CarouselArrows controls={carousel.controls} label="similar movies" />
          </span>
          <Carousel perPage={6} row="related-movies" onControls={carousel.onControls}>
            {posters.map((poster) => (
              <PosterCard
                key={poster.id}
                item={poster}
                focused
                onOpen={(movieId) => void navigate(`/movies/${movieId}`)}
                onFocus={noop}
              />
            ))}
          </Carousel>
        </section>
      )}
    </div>
  );
}

const noop = () => undefined;
