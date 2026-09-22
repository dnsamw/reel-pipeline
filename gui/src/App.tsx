import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clapperboard, FileText, ListChecks, Monitor, Palette, PlayCircle, Settings as SettingsIcon } from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { StartRender } from "./pages/StartRender";
import { ReviewQueue } from "./pages/ReviewQueue";
import { Templates } from "./pages/Templates";
import { TemplateEditor } from "./pages/TemplateEditor";
import { Recipes } from "./pages/Recipes";
import { RecipeEditor } from "./pages/RecipeEditor";
import { VideoSpecPage } from "./pages/VideoSpecPage";
import { Settings } from "./pages/Settings";

const SIDEBAR_COLLAPSED_KEY = "studypal-reels:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const NAV_ITEMS = [
  { to: "/", end: true, icon: Monitor, label: "Monitor" },
  { to: "/review", end: false, icon: ListChecks, label: "Queue Render" },
  { to: "/render", end: false, icon: PlayCircle, label: "Batch Render" },
  { to: "/templates", end: false, icon: Palette, label: "Templates" },
  { to: "/recipes", end: false, icon: Clapperboard, label: "Recipes" },
  { to: "/video-spec", end: false, icon: FileText, label: "Video Spec" },
  { to: "/settings", end: false, icon: SettingsIcon, label: "Settings" },
] as const;

export function App() {
  const [collapsed, setCollapsed] = useState(readCollapsed);

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
    <div className="app">
      <aside className={`app-sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="app-sidebar-header">
          {!collapsed && <span className="brand">StudyPal Reel Studio</span>}
          <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <nav>
          {NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} title={label}>
              <Icon size={18} />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
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
          <Route path="/recipes/new" element={<RecipeEditor />} />
          <Route path="/recipes/:id" element={<RecipeEditor />} />
          <Route path="/video-spec" element={<VideoSpecPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
