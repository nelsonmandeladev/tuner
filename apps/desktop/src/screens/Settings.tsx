import { SegmentedControl } from "../components/SegmentedControl";
import { updateSettings, useSettings, type Theme } from "../data/settings";
import { AboutSection } from "./settings/AboutSection";
import { AccountsSection } from "./settings/AccountsSection";
import { ContentSection } from "./settings/ContentSection";
import { DataSection } from "./settings/DataSection";
import { Row, Section } from "./settings/parts";
import { PlaybackSection } from "./settings/PlaybackSection";

/**
 * Settings (SPEC §9; not in the mockups, see DESIGN.md "Settings"): one
 * column of sections, each a panel of rows with the control on the right.
 */
export function Settings() {
  return (
    <div className="flex min-h-full flex-col gap-10 px-10 pb-16" data-screen="settings">
      <h1 className="text-title">Settings</h1>
      <div className="flex max-w-200 flex-col gap-10">
        <AccountsSection />
        <PlaybackSection />
        <ContentSection />
        <DataSection />
        <AppearanceSection />
        <AboutSection />
      </div>
    </div>
  );
}

function AppearanceSection() {
  const theme = useSettings((s) => s.theme);
  return (
    <Section id="appearance" title="Appearance">
      <Row
        label="Theme"
        description="Video, artwork and the player stay dark in both."
        control={
          <SegmentedControl<Theme>
            label="Theme"
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
            value={theme}
            onChange={(t) => void updateSettings({ theme: t })}
          />
        }
      />
    </Section>
  );
}
