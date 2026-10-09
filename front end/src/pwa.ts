import { useEffect, useState } from "react";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function useInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const before = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const installed = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return async () => {
    if (!event) return false;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    return true;
  };
}
