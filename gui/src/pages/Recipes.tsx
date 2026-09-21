import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { RecipeRecord } from "../types";

const BEAT_LABEL: Record<string, string> = {
  phrase: "Phrase",
  countdown: "Countdown",
  reveal: "Reveal",
  guessReveal: "Guess+Reveal",
};

export function Recipes() {
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.recipes().then(setRecipes).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(reload, []);

  async function onDelete(id: string) {
    if (!confirm(`Delete recipe "${id}"? This removes it from SQLite and recipes/${id}.json (uncommitted deletion won't affect git history until pushed).`))
      return;
    await api.deleteRecipe(id);
    reload();
  }

  const builtins = recipes.filter((r) => r.builtin);
  const custom = recipes.filter((r) => !r.builtin);

  return (
    <div>
      <h1>Recipes</h1>
      <p className="hint" style={{ marginTop: -8 }}>
        A recipe is which scenes a composition sequences - intro, then a repeating unit per phrase (phrase +
        countdown + reveal as separate beats, or one combined guess-and-reveal beat), then outro. Pick one
        anywhere you'd otherwise choose "Composition 1/2/3" - see docs/COMPOSITION_DESIGNER.md.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="button-row" style={{ marginTop: 0, marginBottom: 16 }}>
          <Link to="/recipes/new">
            <button type="button">+ New recipe</button>
          </Link>
        </div>

        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>Built-in</h2>
        {builtins.map((r) => (
          <div className="template-list-item" key={r.id}>
            <div className="template-list-info">
              <div>
                <strong>{r.name}</strong> <span className="badge queued-badge">Built-in</span>
              </div>
              <div className="meta">
                {r.description || "No description"} ·{" "}
                {r.perPhraseBeats.map((b) => BEAT_LABEL[b.kind]).join(", ")}
              </div>
            </div>
            <div className="button-row" style={{ marginTop: 0 }}>
              <Link to={`/recipes/${r.id}`}>
                <button type="button" className="secondary">
                  View
                </button>
              </Link>
            </div>
          </div>
        ))}

        <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 20 }}>Custom</h2>
        {custom.length === 0 ? (
          <p className="hint">No custom recipes yet - create one to sequence beats differently from the built-ins.</p>
        ) : (
          custom.map((r) => (
            <div className="template-list-item" key={r.id}>
              <div className="template-list-info">
                <div>
                  <strong>{r.name}</strong>
                </div>
                <div className="meta">
                  {r.description || "No description"} · {r.perPhraseBeats.map((b) => BEAT_LABEL[b.kind]).join(", ")} · updated{" "}
                  {new Date(r.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="button-row" style={{ marginTop: 0 }}>
                <Link to={`/recipes/${r.id}`}>
                  <button type="button" className="secondary">
                    Edit
                  </button>
                </Link>
                <button type="button" className="danger" onClick={() => onDelete(r.id)}>
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
