import { ArrowRight } from "lucide-react";
import { BrandImage, Button, type T } from "../components";
export default function Welcome({ t, onStart }: { t: T; onStart: () => void }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-art">
        <span className="sparkle sparkle-one" aria-hidden="true">
          ✦
        </span>
        <BrandImage kind="mascot" className="welcome-mascot" />
        <span className="sparkle sparkle-two" aria-hidden="true">
          ✦
        </span>
      </div>
      <BrandImage kind="logo" className="welcome-logo" />
      <h1>{t("welcome")}</h1>
      <div className="welcome-decoration" aria-hidden="true">
        <span>🌿</span>
        <span>🥕</span>
      </div>
      <Button onClick={onStart}>
        {t("start")}
        <ArrowRight size={23} />
      </Button>
    </main>
  );
}
