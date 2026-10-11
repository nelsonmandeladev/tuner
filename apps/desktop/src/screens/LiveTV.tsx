import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export function LiveTV() {
  return (
    <Screen title="Live TV">
      <EmptyState message="Channels from your subscription will appear here, grouped by category." />
    </Screen>
  );
}
