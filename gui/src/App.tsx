import { NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { StartRender } from "./pages/StartRender";
import { Templates } from "./pages/Templates";
import { TemplateEditor } from "./pages/TemplateEditor";
import { VideoSpecPage } from "./pages/VideoSpecPage";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">StudyPal Reel Studio</span>
        <nav>
          <NavLink to="/" end>
            Monitor
          </NavLink>
          <NavLink to="/render">Start Render</NavLink>
          <NavLink to="/templates">Templates</NavLink>
          <NavLink to="/video-spec">Video Spec</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/render" element={<StartRender />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/new" element={<TemplateEditor />} />
          <Route path="/templates/:id" element={<TemplateEditor />} />
          <Route path="/video-spec" element={<VideoSpecPage />} />
        </Routes>
      </main>
    </div>
  );
}
