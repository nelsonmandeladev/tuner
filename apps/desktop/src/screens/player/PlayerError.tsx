import { Button } from "../../components/Button";
import { usePlayer } from "../../player/store";
import { retry, useTuner } from "../../player/tuner";
import { playerErrorMessage } from "../live/messages";

/** What went wrong and what to do (DESIGN.md "States"), over the last frame. */
export function PlayerError({ onBack }: { onBack: () => void }) {
  const error = usePlayer((s) => s.error);
  const inUse = useTuner((s) => s.inUse);
  return (
    <div className="absolute inset-0 flex items-center justify-center" role="alert">
      <div className="flex max-w-120 flex-col items-start gap-4 rounded-card bg-overlay-strong p-6">
        <p className="text-body-l text-text">{playerErrorMessage(error, inUse)}</p>
        <div className="flex gap-2.5">
          <Button onClick={retry}>Try again</Button>
          <Button variant="ghost" onClick={onBack}>
            Back to Live TV
          </Button>
        </div>
      </div>
    </div>
  );
}
