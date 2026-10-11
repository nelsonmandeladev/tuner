import { shortcutLabel } from "../app/platform";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export function Search() {
  return (
    <Screen title="Search">
      <EmptyState
        message={`Search channels, movies and series from anywhere with ${shortcutLabel("K")}.`}
      />
    </Screen>
  );
}
