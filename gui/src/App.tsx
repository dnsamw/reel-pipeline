import { NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { StartRender } from "./pages/StartRender";
import { ReviewQueue } from "./pages/ReviewQueue";
import { Templates } from "./pages/Templates";
import { TemplateEditor } from "./pages/TemplateEditor";
import { Recipes } from "./pages/Recipes";
import { RecipeEditor } from "./pages/RecipeEditor";
import { VideoSpecPage } from "./pages/VideoSpecPage";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <div className="app">
      <aside className="app-sidebar">
        <span className="brand">StudyPal Reel Studio</span>
        <nav>
          <NavLink to="/" end>
            Monitor
          </NavLink>
          <NavLink to="/review">Queue Render</NavLink>
          <NavLink to="/render">Batch Render</NavLink>
          <NavLink to="/templates">Templates</NavLink>
          <NavLink to="/recipes">Recipes</NavLink>
          <NavLink to="/video-spec">Video Spec</NavLink>
          <NavLink to="/settings">Settings</NavLink>
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
