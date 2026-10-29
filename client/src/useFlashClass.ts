import { useEffect, useState } from "react";

/**
 * Applies a temporary CSS class when `token` changes (e.g. score updates).
 */
export function useFlashClass(token: string | number, className = "score-flash"): string {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const t = window.setTimeout(() => setActive(false), 650);
    return () => window.clearTimeout(t);
  }, [token]);

  return active ? className : "";
}
