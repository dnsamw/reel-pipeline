import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ReelConfigNumberFields, ReelConfigPaletteFields } from "../components/ReelConfigFields";
import { RecipePicker } from "../components/RecipePicker";
import type { FacebookStatus, Palette, RecipeRecord, ReelConfig, ReelTheme, Settings as SettingsRecord } from "../types";

type ConfigOverrides = Partial<ReelConfig>;

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [config, setConfig] = useState<ConfigOverrides>({});
  const [defaultSidechain, setDefaultSidechain] = useState(false);
  const [defaultRecipeId, setDefaultRecipeId] = useState<string>("1");
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fbStatus, setFbStatus] = useState<FacebookStatus | null>(null);
  const [fbBusy, setFbBusy] = useState(false);

  function reloadFacebookStatus() {
    api.facebookStatus().then(setFbStatus).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    api.defaultTheme().then(setDefaultTheme).catch(() => {});
    api.recipes().then(setRecipes).catch(() => {});
    Promise.all([api.settings()])
      .then(([s]) => {
        setConfig(s.config);
        setDefaultSidechain(s.defaultSidechain);
        setDefaultRecipeId(s.defaultRecipeId);
        setThemeEnabled(s.config.theme != null);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    reloadFacebookStatus();
  }, []);

  // Facebook's OAuth callback (server/index.ts's /api/facebook/callback)
  // redirects here with one of these query params - surface it once, then
  // strip it from the URL so a page refresh doesn't re-show a stale banner.
  useEffect(() => {
    const fbError = searchParams.get("fbError");
    const fbConnected = searchParams.get("fbConnected");
    const fbPick = searchParams.get("fbPick");
    if (!fbError && !fbConnected && !fbPick) return;
    if (fbError) setError(fbError);
    if (fbConnected) setStatus("Facebook Page connected.");
    reloadFacebookStatus();
    setSearchParams((params) => {
      params.delete("fbError");
      params.delete("fbConnected");
      params.delete("fbPick");
      return params;
    }, { replace: true });
    // fbPick needs no local action beyond reloading status - the pending-pages picker below renders from fbStatus.pendingPages.
  }, [searchParams]);

  function setField<K extends keyof ReelConfig>(key: K, value: ReelConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function setPaletteField(variant: "light" | "dark", key: keyof Palette, value: string) {
    setConfig((c) => {
      const base: ReelTheme = c.theme ?? defaultTheme ?? { light: {} as Palette, dark: {} as Palette };
      return { ...c, theme: { ...base, [variant]: { ...base[variant], [key]: value } } };
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: SettingsRecord = {
        config: { ...config, theme: themeEnabled ? config.theme ?? defaultTheme ?? null : null },
        defaultSidechain,
        defaultRecipeId,
      };
      await api.saveSettings(payload);
      setStatus("Settings saved - applied to every render from now on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function selectPage(pageId: string) {
    setFbBusy(true);
    setError(null);
    try {
      await api.facebookSelectPage(pageId);
      setStatus("Facebook Page connected.");
      reloadFacebookStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFbBusy(false);
    }
  }

  async function disconnect() {
    setFbBusy(true);
    setError(null);
    try {
      await api.facebookDisconnect();
      reloadFacebookStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFbBusy(false);
    }
  }

  const lightPalette = config.theme?.light ?? defaultTheme?.light;
  const darkPalette = config.theme?.dark ?? defaultTheme?.dark;

  return (
    <div>
      <h1>Settings</h1>
      <p className="hint" style={{ marginTop: -8 }}>
        Global defaults - the baseline every render starts from (Batch Render, Queue Render, and the Template
        Editor's own "defaults" merge). A saved template preset's fields still override these where it sets
        them; explicit flags on a single run override both.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {status && <div className="success-banner">{status}</div>}

      {!loaded ? (
        <p className="hint">Loading...</p>
      ) : (
        <form onSubmit={onSave}>
          <div className="card">
            <h2>Run defaults</h2>
            <div className="grid">
              <div className="field">
                <label>Composition</label>
                <RecipePicker recipes={recipes} value={defaultRecipeId} onChange={setDefaultRecipeId} />
              </div>
              <div className="field checkbox">
                <input
                  id="settings-tts"
                  type="checkbox"
                  checked={config.ttsEnabled ?? false}
                  onChange={(e) => setField("ttsEnabled", e.target.checked)}
                />
                <label htmlFor="settings-tts">Narration (TTS) on by default</label>
              </div>
              <div className="field checkbox">
                <input
                  id="settings-sidechain"
                  type="checkbox"
                  checked={defaultSidechain}
                  onChange={(e) => setDefaultSidechain(e.target.checked)}
                />
                <label htmlFor="settings-sidechain">Duck music under dialogue/sfx by default</label>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Timing &amp; audio defaults</h2>
            <ReelConfigNumberFields config={config} onChange={setField} />
          </div>

          <div className="card">
            <h2>Copy defaults</h2>
            <div className="grid">
              <div className="field">
                <label>CTA URL</label>
                <input type="text" value={(config.ctaUrl as string) ?? ""} onChange={(e) => setField("ctaUrl", e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Intro text</label>
                <input type="text" value={(config.introText as string) ?? ""} onChange={(e) => setField("introText", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Color defaults</h2>
            <div className="field checkbox" style={{ marginBottom: 14 }}>
              <input id="settings-theme-enabled" type="checkbox" checked={themeEnabled} onChange={(e) => setThemeEnabled(e.target.checked)} />
              <label htmlFor="settings-theme-enabled">Override the built-in brand palette by default</label>
            </div>
            {themeEnabled && lightPalette && darkPalette && (
              <>
                <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>Light scenes</h2>
                <ReelConfigPaletteFields variant="light" palette={lightPalette} onChange={(k, v) => setPaletteField("light", k, v)} />
                <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 18 }}>
                  Dark scenes (Template 3)
                </h2>
                <ReelConfigPaletteFields variant="dark" palette={darkPalette} onChange={(k, v) => setPaletteField("dark", k, v)} />
              </>
            )}
          </div>

          <div className="button-row">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <h2>Facebook Page</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Connect the Page you admin so rendered reels can be published straight from the Monitor page, with a
          record kept of what was generated vs. what's actually live.
        </p>

        {fbStatus?.pendingPages ? (
          <>
            <p className="hint">That Facebook account admins more than one Page - pick which one to connect:</p>
            {fbStatus.pendingPages.map((p) => (
              <div key={p.id} className="button-row" style={{ marginTop: 0, marginBottom: 8 }}>
                <button type="button" disabled={fbBusy} onClick={() => selectPage(p.id)}>
                  Use "{p.name}"
                </button>
              </div>
            ))}
          </>
        ) : fbStatus?.page ? (
          <div className="button-row" style={{ marginTop: 0, alignItems: "center" }}>
            <span className="badge done">Connected</span>
            <span>{fbStatus.page.name}</span>
            <button type="button" className="danger" disabled={fbBusy} onClick={disconnect} style={{ marginLeft: "auto" }}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="button-row" style={{ marginTop: 0 }}>
            <button type="button" onClick={() => (window.location.href = api.facebookConnectUrl())}>
              Connect with Facebook
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
