import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";

export function Home() {
  return (
    <Screen title="Home">
      <EmptyState message="Continue watching, favorite channels and new arrivals show up here once a subscription is connected." />
    </Screen>
  );
}
