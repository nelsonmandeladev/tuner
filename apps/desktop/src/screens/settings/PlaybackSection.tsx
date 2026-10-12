import { SegmentedControl } from "../../components/SegmentedControl";
import { Select } from "../../components/Select";
import { Switch } from "../../components/Switch";
import {
  LANGUAGES,
  updateSettings,
  useSettings,
  type BufferSize,
  type Deinterlace,
} from "../../data/settings";
import { Row, Section } from "./parts";

const DEFAULT = "default";
const languageOptions = [
  { value: DEFAULT, label: "As the stream says" },
  ...LANGUAGES.map((l) => ({ value: l.id as string, label: l.label })),
];

/** Settings → Playback (SPEC §9). Every change applies from the next stream. */
export function PlaybackSection() {
  const settings = useSettings();
  return (
    <Section id="playback" title="Playback">
      <Row
        label="Audio language"
        description="Picked first when a stream has several. A choice made for a channel, movie or series still wins."
        control={
          <Select
            label="Audio language"
            options={languageOptions}
            value={settings.audioLanguage ?? DEFAULT}
            onChange={(v) => void updateSettings({ audioLanguage: v === DEFAULT ? null : v })}
          />
        }
      />
      <Row
        label="Subtitle language"
        description="Subtitles in this language are shown when a stream has them."
        control={
          <Select
            label="Subtitle language"
            options={languageOptions}
            value={settings.subtitleLanguage ?? DEFAULT}
            onChange={(v) => void updateSettings({ subtitleLanguage: v === DEFAULT ? null : v })}
          />
        }
      />
      <Row
        label="Hardware decoding"
        htmlFor="setting-hwdec"
        description="Decodes video on the graphics card. Turn it off if a stream stays black or shows blocks."
        control={
          <Switch
            id="setting-hwdec"
            label="Hardware decoding"
            checked={settings.hardwareDecoding}
            onChange={(on) => void updateSettings({ hardwareDecoding: on })}
          />
        }
      />
      <Row
        label="Buffer"
        description="Video downloaded ahead: 50, 150 or 400 MB. More rides out a shaky connection; less uses less memory."
        control={
          <SegmentedControl<BufferSize>
            label="Buffer"
            options={[
              { value: "small", label: "Small" },
              { value: "normal", label: "Normal" },
              { value: "large", label: "Large" },
            ]}
            value={settings.buffer}
            onChange={(buffer) => void updateSettings({ buffer })}
          />
        }
      />
      <Row
        label="Deinterlacing"
        description="Smooths interlaced channels (1080i, 576i). Auto applies it only where the picture is interlaced."
        control={
          <SegmentedControl<Deinterlace>
            label="Deinterlacing"
            options={[
              { value: "auto", label: "Auto" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            value={settings.deinterlace}
            onChange={(deinterlace) => void updateSettings({ deinterlace })}
          />
        }
      />
    </Section>
  );
}
