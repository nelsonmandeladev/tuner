import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export function Settings() {
  return (
    <Screen title="Settings">
      <EmptyState message="Accounts, playback, content and data settings will live here." />
    </Screen>
  );
}
