import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/features/theme/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return <button type="button" onClick={toggleTheme} aria-label={`Switch to ${isDark ? "light" : "dark"} theme`} title={`Switch to ${isDark ? "light" : "dark"} theme`} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-background/30 text-muted-foreground transition hover:bg-muted hover:text-foreground">
    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
  </button>;
}
