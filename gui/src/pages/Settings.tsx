import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { PlatformDot } from "../components/PublishPanel";
import { ReelConfigNumberFields, ReelConfigPaletteFields } from "../components/ReelConfigFields";
import { RecipePicker } from "../components/RecipePicker";
import type { FacebookStatus, Palette, PlatformStatus, RecipeRecord, ReelConfig, ReelTheme, Settings as SettingsRecord } from "../types";

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

  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);

  function reloadFacebookStatus() {
    api.facebookStatus().then(setFbStatus).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.platforms().then(setPlatforms).catch(() => {});
  }

  async function connectInstagram() {
    setFbBusy(true);
    setError(null);
    try {
      const ig = await api.instagramConnect();
      setStatus(`Instagram connected: @${ig.username}.`);
      reloadFacebookStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFbBusy(false);
    }
  }

  async function disconnectOAuth(disconnectCall: () => Promise<void>) {
    setFbBusy(true);
    try {
      await disconnectCall();
      reloadFacebookStatus();
    } finally {
      setFbBusy(false);
    }
  }

  async function disconnectInstagram() {
    setFbBusy(true);
    try {
      await api.instagramDisconnect();
      reloadFacebookStatus();
    } finally {
      setFbBusy(false);
    }
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
    const ytError = searchParams.get("ytError");
    const ytConnected = searchParams.get("ytConnected");
    const ttError = searchParams.get("ttError");
    const ttConnected = searchParams.get("ttConnected");
    if (!fbError && !fbConnected && !fbPick && !ytError && !ytConnected && !ttError && !ttConnected) return;
    if (ttError) setError(`TikTok: ${ttError}`);
    if (ttConnected) setStatus(`TikTok connected: ${ttConnected}.`);
    if (fbError) setError(fbError);
    if (fbConnected) setStatus("Facebook Page connected.");
    if (ytError) setError(`YouTube: ${ytError}`);
    if (ytConnected) setStatus(`YouTube connected: ${ytConnected}.`);
    reloadFacebookStatus();
    setSearchParams((params) => {
      params.delete("fbError");
      params.delete("fbConnected");
      params.delete("fbPick");
      params.delete("ytError");
      params.delete("ytConnected");
      params.delete("ttError");
      params.delete("ttConnected");
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
        <form onSubmit={onSave} className="settings-form">
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
                  id="settings-tts-en"
                  type="checkbox"
                  checked={config.ttsEnglish ?? true}
                  onChange={(e) => setField("ttsEnglish", e.target.checked)}
                />
                <label htmlFor="settings-tts-en">English voice (the phrase)</label>
              </div>
              <div className="field checkbox">
                <input
                  id="settings-tts-si"
                  type="checkbox"
                  checked={config.ttsSinhala ?? true}
                  onChange={(e) => setField("ttsSinhala", e.target.checked)}
                />
                <label htmlFor="settings-tts-si">Sinhala voice (the meaning)</label>
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
        <h2>Connected accounts</h2>
        <p className="hint accounts-intro">
          Where Post Creator exports and rendered reels can be published. Each publish lets you pick which of these to post to.
        </p>

        <div className="account-row">
          <PlatformDot platform="facebook" />
          <div className="account-main">
            <strong>Facebook Page</strong>
            {fbStatus?.pendingPages ? (
              <>
                <span className="hint">That Facebook account admins more than one Page - pick which one to connect:</span>
                <div className="button-row" style={{ marginTop: 6 }}>
                  {fbStatus.pendingPages.map((p) => (
                    <button key={p.id} type="button" disabled={fbBusy} onClick={() => selectPage(p.id)}>
                      Use "{p.name}"
                    </button>
                  ))}
                </div>
              </>
            ) : fbStatus?.page ? (
              <span className="account-name">{fbStatus.page.name}</span>
            ) : (
              <span className="hint">Photos, Reels and videos on the Page you admin.</span>
            )}
          </div>
          {fbStatus?.page ? (
            <>
              <span className="badge done">Connected</span>
              <button type="button" className="danger" disabled={fbBusy} onClick={disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            !fbStatus?.pendingPages && (
              <button type="button" onClick={() => (window.location.href = api.facebookConnectUrl())}>
                Connect
              </button>
            )
          )}
        </div>

        {(() => {
          const ig = platforms.find((p) => p.platform === "instagram");
          return (
            <div className="account-row">
              <PlatformDot platform="instagram" />
              <div className="account-main">
                <strong>Instagram</strong>
                {ig?.connected ? (
                  <span className="account-name">{ig.accountName}</span>
                ) : (
                  <>
                    <span className="hint">Reels and feed images, published through your Facebook Page.</span>
                    <details className="setup-steps">
                      <summary>Setup steps</summary>
                      <ol>
                        <li>
                          In the Instagram app: <em>Settings → Account type and tools → Switch to professional account</em> (Business or
                          Creator).
                        </li>
                        <li>
                          Link it to your Facebook Page: in Meta Business Suite or the Page's settings, under <em>Linked accounts → Instagram</em>.
                        </li>
                        <li>
                          In your Meta app dashboard, add the <code>instagram_basic</code> and <code>instagram_content_publish</code> permissions
                          (in the Facebook Login for Business configuration your <code>FACEBOOK_CONFIG_ID</code> points at, if you use one).
                        </li>
                        <li>Disconnect and reconnect Facebook above so the new permissions are granted.</li>
                        <li>
                          Click <strong>Connect</strong>. It finds the Instagram account linked to your Page; no separate login.
                        </li>
                      </ol>
                    </details>
                  </>
                )}
              </div>
              {ig?.connected ? (
                <>
                  <span className="badge done">Connected</span>
                  <button type="button" className="danger" disabled={fbBusy} onClick={disconnectInstagram}>
                    Disconnect
                  </button>
                </>
              ) : (
                <button type="button" disabled={fbBusy || !fbStatus?.page} onClick={connectInstagram} title={fbStatus?.page ? undefined : "Connect Facebook first"}>
                  Connect
                </button>
              )}
            </div>
          );
        })()}

        <OAuthAccountRow
          status={platforms.find((p) => p.platform === "youtube")}
          connectUrl={api.youtubeConnectUrl()}
          busy={fbBusy}
          onDisconnect={() => disconnectOAuth(api.youtubeDisconnect)}
          connectedNote="Uploads are Private unless you choose otherwise when publishing."
          steps={
            <>
              <ol>
                <li>
                  In <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project (or
                  pick one) and enable <strong>YouTube Data API v3</strong> (APIs &amp; Services → Library).
                </li>
                <li>
                  <em>APIs &amp; Services → OAuth consent screen</em>: user type <strong>External</strong>, fill in the app name and your email,
                  and add yourself under <strong>Test users</strong>.
                </li>
                <li>
                  <em>Credentials → Create credentials → OAuth client ID</em>, application type <strong>Desktop app</strong>.
                </li>
                <li>
                  Put the client ID and secret in <code>.env</code> as <code>YOUTUBE_CLIENT_ID</code> and <code>YOUTUBE_CLIENT_SECRET</code>, then
                  restart the server.
                </li>
                <li>
                  Click <strong>Connect</strong> and sign in with the Google account that owns the channel. "Google hasn't verified this app" is
                  expected for your own test app: choose <em>Continue</em>.
                </li>
              </ol>
              <p className="hint">
                Until Google audits the project, YouTube keeps every upload <strong>private</strong>. While the consent screen is in "Testing",
                the login expires after 7 days and you reconnect here.
              </p>
            </>
          }
        />

        <OAuthAccountRow
          status={platforms.find((p) => p.platform === "tiktok")}
          connectUrl={api.tiktokConnectUrl()}
          busy={fbBusy}
          onDisconnect={() => disconnectOAuth(api.tiktokDisconnect)}
          connectedNote="Reels go to your TikTok drafts - finish and post them in the TikTok app."
          steps={
            <>
              <ol>
                <li>
                  At <a href="https://developers.tiktok.com/" target="_blank" rel="noreferrer">developers.tiktok.com</a>, log in and create an
                  app (<em>Manage apps → Connect an app</em>).
                </li>
                <li>
                  Add the products <strong>Login Kit</strong> and <strong>Content Posting API</strong>. Under Content Posting API, enable{" "}
                  <strong>Upload</strong> (Direct Post isn't needed). Make sure the scopes include <code>user.info.basic</code> and{" "}
                  <code>video.upload</code>.
                </li>
                <li>
                  In Login Kit, choose platform <strong>Desktop</strong> and add the redirect URI{" "}
                  <code>http://127.0.0.1:*/api/tiktok/callback/</code> (the <code>*</code> port and the trailing slash matter).
                </li>
                <li>
                  Until the app is reviewed, use its <strong>Sandbox</strong> and add your TikTok account as a <strong>target user</strong> there,
                  using the Sandbox's client key and secret in the next step.
                </li>
                <li>
                  Put the client key and secret in <code>.env</code> as <code>TIKTOK_CLIENT_KEY</code> and <code>TIKTOK_CLIENT_SECRET</code>, then
                  restart the server and click <strong>Connect</strong>.
                </li>
              </ol>
              <p className="hint">
                Uploads arrive as drafts in your TikTok inbox (at most 5 pending per 24 hours). TikTok's API doesn't carry the caption for
                drafts, so you paste it in the app. Videos only.
              </p>
            </>
          }
        />

        {platforms
          .filter((p) => !p.available)
          .map((p) => (
            <div className="account-row upcoming" key={p.platform}>
              <PlatformDot platform={p.platform} />
              <div className="account-main">
                <strong>{p.label}</strong>
                <span className="hint">{p.setupHint}</span>
              </div>
              <span className="badge queued">Coming soon</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * A platform connected through its own OAuth login (YouTube, TikTok): Connect
 * navigates to the server's /connect route (full-page redirect to the
 * platform), which returns to /settings with ?xxConnected / ?xxError.
 */
function OAuthAccountRow({
  status,
  connectUrl,
  busy,
  onDisconnect,
  connectedNote,
  steps,
}: {
  status: PlatformStatus | undefined;
  connectUrl: string;
  busy: boolean;
  onDisconnect: () => void;
  connectedNote: string;
  steps: React.ReactNode;
}) {
  if (!status?.available) return null;
  return (
    <div className="account-row">
      <PlatformDot platform={status.platform} />
      <div className="account-main">
        <strong>{status.label}</strong>
        {status.connected ? (
          <>
            <span className="account-name">{status.accountName}</span>
            <span className="hint">{connectedNote}</span>
          </>
        ) : (
          <>
            <span className="hint">{status.setupHint}</span>
            <details className="setup-steps">
              <summary>Setup steps</summary>
              {steps}
            </details>
          </>
        )}
      </div>
      {status.connected ? (
        <>
          <span className="badge done">Connected</span>
          <button type="button" className="danger" disabled={busy} onClick={onDisconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={!status.configured}
          title={status.configured ? undefined : "Add the credentials to .env first"}
          onClick={() => (window.location.href = connectUrl)}
        >
          Connect
        </button>
      )}
    </div>
  );
}
