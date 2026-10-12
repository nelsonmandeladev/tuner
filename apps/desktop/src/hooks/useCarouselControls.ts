import { useCallback, useState } from "react";

export interface CarouselControls {
  canBack: boolean;
  canForward: boolean;
  /** Scrolls one page back (-1) or forward (1). */
  page: (direction: -1 | 1) => void;
}

/** Carousel state for a row: pass `onControls` to the Carousel and `controls` to its arrows. */
export function useCarouselControls() {
  const [controls, setControls] = useState<CarouselControls | null>(null);
  const onControls = useCallback(
    (next: CarouselControls) =>
      setControls((current) =>
        current &&
        current.canBack === next.canBack &&
        current.canForward === next.canForward &&
        current.page === next.page
          ? current
          : next,
      ),
    [],
  );
  return { controls, onControls };
}
