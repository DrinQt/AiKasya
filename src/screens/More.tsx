import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Settings,
  Languages,
  Info,
  CircleHelp,
  Trash2,
  ChevronRight,
  Heart,
  Download,
  Wallet,
} from "lucide-react";
import { BrandImage, Button, type T, type Screen } from "../components";
import { initialState, type State } from "../state";
export default function More({
  state,
  setState,
  t,
  navigate,
  onInstall,
}: {
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  t: T;
  navigate: (s: Screen) => void;
  onInstall: () => void;
}) {
  const [panel, setPanel] = useState<
    "settings" | "language" | "about" | "help" | "clear" | "support" | null
  >(null);
  const rows = [
    { key: "settings", icon: Settings },
    { key: "language", icon: Languages },
    { key: "about", icon: Info },
    { key: "help", icon: CircleHelp },
    { key: "clear", icon: Trash2 },
  ] as const;
  return (
    <main className="screen-content more-content">
      <div className="app-profile">
        <BrandImage kind="mascot" />
        <div>
          <h2>AiKasya</h2>
          <p>{t("version")}</p>
        </div>
      </div>
      <div className="settings-list">
        {rows.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setPanel(panel === key ? null : key)}
            aria-expanded={panel === key}
          >
            <Icon size={22} />
            <strong>{t(key)}</strong>
            {key === "language" && (
              <span>{state.language === "en" ? "English" : "Filipino"}</span>
            )}
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
      {panel && (
        <section
          className="simple-card settings-panel"
          aria-label={t(panel === "support" ? "support" : panel)}
        >
          {(panel === "language" || panel === "settings") && (
            <>
              <label htmlFor="language-select">{t("language")}</label>
              <select
                id="language-select"
                className="language-select"
                value={state.language}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    language: e.target.value as "en" | "fil",
                  }))
                }
              >
                <option value="en">English</option>
                <option value="fil">Filipino</option>
              </select>
            </>
          )}
          {panel === "settings" && (
            <>
              <button
                className="secondary-button"
                onClick={() => navigate("budget")}
              >
                <Wallet size={18} />
                {t("setup")}
              </button>
              <button className="secondary-button" onClick={onInstall}>
                <Download size={18} />
                {t("install")}
              </button>
              <button
                className="text-button"
                onClick={() => navigate("welcome")}
              >
                {t("welcomeAgain")}
              </button>
            </>
          )}
          {(panel === "about" || panel === "help" || panel === "support") && (
            <p>
              {t(
                panel === "about"
                  ? "aboutText"
                  : panel === "help"
                    ? "helpText"
                    : "supportText",
              )}
            </p>
          )}
          {panel === "about" && (
            <div className="photo-credits">
              <a
                href="https://commons.wikimedia.org/wiki/File:Pork_adobo.jpg"
                target="_blank"
                rel="noreferrer"
              >
                Adobo: Obsidian Soul · CC0
              </a>
              <a
                href="https://commons.wikimedia.org/wiki/File:Ginisang_Munggo,_Apr_2024.jpg"
                target="_blank"
                rel="noreferrer"
              >
                Monggo: Ralffralff · CC BY-SA 4.0
              </a>
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 4.0
              </a>
            </div>
          )}
          {panel === "clear" && (
            <>
              <h3>{t("clearTitle")}</h3>
              <p>{t("confirmClear")}</p>
              <Button
                onClick={() => {
                  setState({
                    ...initialState,
                    language: state.language,
                    started: true,
                  });
                  setPanel(null);
                  navigate("home");
                }}
              >
                {t("reset")}
              </Button>
              <button className="text-button" onClick={() => setPanel(null)}>
                {t("cancel")}
              </button>
            </>
          )}
        </section>
      )}
      <button
        className="support-button"
        onClick={() => setPanel(panel === "support" ? null : "support")}
      >
        <Heart fill="#ed493d" color="#d62c20" />
        {t("support")}
      </button>
      <div className="more-decoration" aria-hidden="true">
        <span>🌿</span>
        <BrandImage kind="mascot" />
        <span>🌿</span>
      </div>
    </main>
  );
}
