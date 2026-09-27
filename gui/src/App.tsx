import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FileText,
  FolderOpen,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  Monitor,
  Moon,
  Palette,
  PlayCircle,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { StudyPalLogo } from "../../src/posts/StudyPalLogo";
import { applyThemePref, NEXT_THEME, readThemePref, type ThemePref } from "./lib/theme";
import { Dashboard } from "./pages/Dashboard";
import { StartRender } from "./pages/StartRender";
import { ReviewQueue } from "./pages/ReviewQueue";
import { Templates } from "./pages/Templates";
import { TemplateEditor } from "./pages/TemplateEditor";
import { Recipes } from "./pages/Recipes";
import { RecipeEditor } from "./pages/RecipeEditor";
import { VideoSpecPage } from "./pages/VideoSpecPage";
import { Settings } from "./pages/Settings";
import { PostCreator } from "./pages/PostCreator";
import { MediaLibrary } from "./pages/MediaLibrary";

const SIDEBAR_COLLAPSED_KEY = "studypal-reels:sidebar-collapsed"; // key kept from the old name so the saved state survives the rename

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

// Grouped by what you're doing rather than one flat list - section titles
// hide when the sidebar is collapsed (a divider remains).
const NAV_SECTIONS = [
  { title: null, items: [{ to: "/", end: true, icon: LayoutDashboard, label: "Monitor" }] },
  {
    title: "Reels",
    items: [
      { to: "/review", end: false, icon: ListChecks, label: "Queue Render" },
      { to: "/render", end: false, icon: PlayCircle, label: "Batch Render" },
      { to: "/recipes", end: false, icon: Clapperboard, label: "Recipes" },
      { to: "/templates", end: false, icon: Palette, label: "Templates" },
    ],
  },
  { title: "Posts", items: [{ to: "/post-creator", end: false, icon: ImagePlus, label: "Post Creator" }] },
  {
    title: "Manage",
    items: [
      { to: "/library", end: false, icon: FolderOpen, label: "Media Library" },
      { to: "/video-spec", end: false, icon: FileText, label: "Video Spec" },
      { to: "/settings", end: false, icon: SettingsIcon, label: "Settings" },
    ],
  },
] as const;

const THEME_META: Record<ThemePref, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: "System theme" },
  light: { icon: Sun, label: "Light theme" },
  dark: { icon: Moon, label: "Dark theme" },
};

export function App() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [theme, setTheme] = useState<ThemePref>(readThemePref);

  function cycleTheme() {
    const next = NEXT_THEME[theme];
    applyThemePref(next);
    setTheme(next);
  }

  const ThemeIcon = THEME_META[theme].icon;

  function toggleCollapsed() {
    setCollapsed((cur) => {
      const next = !cur;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // per-viewer convenience only - fine if storage is unavailable (private window, etc.)
      }
      return next;
    });
  }

  return (
    // --sidebar-width lets a full-bleed page (RecipeEditor.tsx's workspace)
    // offset itself around the sidebar without needing to lift collapse
    // state into a context - it just reads the same variable via CSS.
    <div className="app" style={{ "--sidebar-width": collapsed ? "60px" : "220px" } as React.CSSProperties}>
      <aside className={`app-sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="app-sidebar-header">
          <StudyPalLogo size={collapsed ? 34 : 36} tile="#F9B200" ink="#591F82" />
          {!collapsed && (
            <span className="brand">
              <span className="brand-name">StudyPal</span>
              <span className="brand-sub">Studio</span>
            </span>
          )}
        </div>
        <nav>
          {NAV_SECTIONS.map((section, i) => (
            <div className="nav-section" key={i}>
              {section.title && (collapsed ? <hr className="nav-divider" /> : <div className="nav-section-title">{section.title}</div>)}
              {section.items.map(({ to, end, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={end} title={label}>
                  <Icon size={18} />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="app-sidebar-footer">
          <button type="button" className="sidebar-toggle" onClick={cycleTheme} title={`${THEME_META[theme].label} (click to change)`}>
            <ThemeIcon size={18} />
            {!collapsed && <span className="sidebar-toggle-label">{THEME_META[theme].label}</span>}
          </button>
          <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/render" element={<StartRender />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/new" element={<TemplateEditor />} />
          <Route path="/templates/:id" element={<TemplateEditor />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/post-creator" element={<PostCreator />} />
          <Route path="/library" element={<MediaLibrary />} />
          <Route path="/recipes/new" element={<RecipeEditor />} />
          <Route path="/recipes/:id" element={<RecipeEditor />} />
          <Route path="/video-spec" element={<VideoSpecPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
