import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { APP_NAME, REPO_URL } from "../../app/brand";
import { Button } from "../../components/Button";
import { Row, Section } from "./parts";

const inTauri = "__TAURI_INTERNALS__" in window;

/** Opens a page of the project in the default browser (`pnpm dev:web`: a new tab). */
function openProjectPage(path: string) {
  const url = `${REPO_URL}${path}`;
  if (inTauri) void openUrl(url);
  else window.open(url, "_blank", "noopener");
}

/** Settings → About: version, licence, privacy and where to report problems. */
export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (inTauri) void getVersion().then(setVersion);
  }, []);

  return (
    <Section id="about" title="About">
      <Row
        label={version ? `${APP_NAME} ${version}` : APP_NAME}
        description="Free and open source under the MIT licence. A player for your own subscription: it includes no channels."
        control={
          <Button variant="ghost" size="sm" onClick={() => openProjectPage("")}>
            Source code
          </Button>
        }
      />
      <Row
        label="Open-source software"
        description="Video playback uses mpv and FFmpeg, under the LGPL."
        control={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openProjectPage("/blob/main/THIRD_PARTY_NOTICES.md")}
          >
            Licences
          </Button>
        }
      />
      <Row
        label="Privacy"
        description={`${APP_NAME} collects nothing. Your lists, history and password stay on this computer.`}
        control={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openProjectPage("/blob/main/PRIVACY.md")}
          >
            Privacy policy
          </Button>
        }
      />
      <Row
        label="Report a problem"
        description="Leave out your server address, username and password: reports are public."
        control={
          <Button variant="ghost" size="sm" onClick={() => openProjectPage("/issues/new/choose")}>
            Open an issue
          </Button>
        }
      />
    </Section>
  );
}
