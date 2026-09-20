import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { TemplateRecord } from "../types";

export function Templates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.templates().then(setTemplates).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(reload, []);

  async function onDelete(id: string) {
    if (!confirm(`Delete template "${id}"? This removes it from SQLite and templates/${id}.json (uncommitted deletion won't affect git history until pushed).`)) return;
    await api.deleteTemplate(id);
    reload();
  }

  return (
    <div>
      <h1>Template Library</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="button-row" style={{ marginTop: 0, marginBottom: 16 }}>
          <Link to="/templates/new">
            <button type="button">+ New template</button>
          </Link>
        </div>

        {templates.length === 0 ? (
          <p className="hint">No templates saved yet - create one to reuse durations/volumes/colors/TTS speed across runs.</p>
        ) : (
          templates.map((t) => (
            <div className="template-list-item" key={t.id}>
              <div>
                <div>
                  <strong>{t.name}</strong> <span className="hint">(template {t.templateNumber})</span>
                </div>
                <div className="meta">{t.description || "No description"} · updated {new Date(t.updatedAt).toLocaleString()}</div>
              </div>
              <div className="button-row" style={{ marginTop: 0 }}>
                <Link to={`/templates/${t.id}`}>
                  <button type="button" className="secondary">
                    Edit
                  </button>
                </Link>
                <button type="button" className="danger" onClick={() => onDelete(t.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
