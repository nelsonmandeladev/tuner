import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export function Movies() {
  return (
    <Screen title="Movies">
      <EmptyState message="Movies from your subscription will appear here." />
    </Screen>
  );
}
