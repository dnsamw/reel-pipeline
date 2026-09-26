import type {
  Book,
  Chapter,
  CompositionRecipe,
  DataSourceDescriptor,
  FacebookStatus,
  Manifest,
  Phrase,
  Publication,
  QueueItem,
  RecipeRecord,
  ReelConfig,
  ReelTheme,
  RenderRun,
  Settings,
  TemplateRecord,
  VideoSpec,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  defaults: () => request<ReelConfig>("/config/defaults"),
  defaultTheme: () => request<ReelTheme>("/theme/default"),
  dataSources: () => request<DataSourceDescriptor[]>("/data-sources"),
  books: () => request<Book[]>("/books"),
  chapters: (book?: string | null) => request<Chapter[]>(`/chapters${book ? `?book=${encodeURIComponent(book)}` : ""}`),
  previewBatches: (params: { book?: string | null; min?: number | null; max?: number | null; phrasesPerReel?: number }) => {
    const q = new URLSearchParams();
    if (params.book) q.set("book", params.book);
    if (params.min != null) q.set("min", String(params.min));
    if (params.max != null) q.set("max", String(params.max));
    if (params.phrasesPerReel != null) q.set("phrasesPerReel", String(params.phrasesPerReel));
    return request<{ phraseCount: number; batchCount: number }>(`/preview-batches?${q.toString()}`);
  },
  manifest: () => request<Manifest>("/manifest"),
  videoSpec: () => request<VideoSpec>("/video-spec"),

  queue: (params: { book?: string | null; min?: number | null; max?: number | null; phrasesPerReel?: number; template?: string }) => {
    const q = new URLSearchParams();
    if (params.book) q.set("book", params.book);
    if (params.min != null) q.set("min", String(params.min));
    if (params.max != null) q.set("max", String(params.max));
    if (params.phrasesPerReel != null) q.set("phrasesPerReel", String(params.phrasesPerReel));
    if (params.template) q.set("template", params.template);
    return request<QueueItem[]>(`/queue?${q.toString()}`);
  },
  updatePhrase: (id: string, fields: Pick<Phrase, "phrase" | "translationSi" | "pronunciationSi" | "explanation" | "explanationSi">) =>
    request<{ ok: boolean }>(`/phrases/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(fields) }),

  templates: () => request<TemplateRecord[]>("/templates"),
  template: (id: string) => request<TemplateRecord>(`/templates/${encodeURIComponent(id)}`),
  createTemplate: (input: Omit<TemplateRecord, "id" | "createdAt" | "updatedAt">) =>
    request<TemplateRecord>("/templates", { method: "POST", body: JSON.stringify(input) }),
  updateTemplate: (id: string, input: Omit<TemplateRecord, "id" | "createdAt" | "updatedAt">) =>
    request<TemplateRecord>(`/templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteTemplate: (id: string) => request<void>(`/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  pushTemplates: (id: string, message: string) =>
    request<{ pushed: boolean; output: string }>(`/templates/${encodeURIComponent(id)}/push`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  recipes: () => request<RecipeRecord[]>("/recipes"),
  recipe: (id: string) => request<RecipeRecord>(`/recipes/${encodeURIComponent(id)}`),
  createRecipe: (input: Omit<CompositionRecipe, "id">) => request<RecipeRecord>("/recipes", { method: "POST", body: JSON.stringify(input) }),
  updateRecipe: (id: string, input: Omit<CompositionRecipe, "id">) =>
    request<RecipeRecord>(`/recipes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteRecipe: (id: string) => request<void>(`/recipes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  pushRecipes: (id: string, message: string) =>
    request<{ pushed: boolean; output: string }>(`/recipes/${encodeURIComponent(id)}/push`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  startRender: (body: {
    chapters?: string;
    limit?: number;
    force?: boolean;
    tts?: boolean;
    template?: string;
    book?: string;
    sidechain?: boolean;
    templateId?: string;
    phraseIds?: string[];
    /** Which recipe/composition to render with - a built-in id ("1"/"2"/"3") behaves exactly like `template`; a custom recipe's id renders through the dynamic composition (server/recipes.ts). Replaces raw `template` as the GUI's own choice - see RecipePicker. */
    recipeId?: string;
  }) => request<RenderRun>("/render/start", { method: "POST", body: JSON.stringify(body) }),
  listRuns: () => request<RenderRun[]>("/render"),
  getRun: (id: string) => request<RenderRun>(`/render/${encodeURIComponent(id)}`),
  cancelRun: (id: string) => request<{ cancelled: boolean }>(`/render/${encodeURIComponent(id)}/cancel`, { method: "POST" }),

  // Not through request() - this sends the raw File as the body, not JSON
  // (matching server/index.ts's express.raw() route, not express.json()).
  uploadImage: async (file: File) => {
    const res = await fetch(`/api/assets/images?filename=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<{ path: string }>;
  },

  settings: () => request<Settings>("/settings"),
  saveSettings: (input: Settings) => request<Settings>("/settings", { method: "PUT", body: JSON.stringify(input) }),

  facebookStatus: () => request<FacebookStatus>("/facebook/status"),
  // Full-page navigation (window.location.href), not fetch() - the OAuth
  // dialog is a real page Facebook needs to redirect the user's browser to.
  facebookConnectUrl: () => "/api/facebook/connect",
  facebookSelectPage: (pageId: string) =>
    request<{ id: string; name: string }>("/facebook/select-page", { method: "POST", body: JSON.stringify({ pageId }) }),
  facebookDisconnect: () => request<void>("/facebook/disconnect", { method: "POST" }),

  publications: () => request<Publication[]>("/publications"),
  publish: (body: { batchId: string; template: string; caption?: string }) =>
    request<Publication>("/publish", { method: "POST", body: JSON.stringify(body) }),

  musicTracks: () => request<{ file: string; durationSeconds: number | null }[]>("/music"),
  // Not through request() - the success response is the MP4 itself.
  renderPostReel: async (body: {
    templateId: string;
    fields: Record<string, string>;
    lists: Record<string, Record<string, string>[]>;
    colors: Record<string, string>;
    reel: { durationSeconds: number; musicFile: string | null; musicStartSeconds: number; musicVolume: number; frame: "reel" | "original" };
  }) => {
    const res = await fetch("/api/posts/reel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `${res.status} ${res.statusText}`);
    }
    return { blob: await res.blob(), savedPath: res.headers.get("X-Saved-Path") ?? "" };
  },
  warmPostRenderer: () => request<void>("/posts/warm", { method: "POST" }),
  // Not through request() - the success response is the PNG itself, not JSON.
  renderPost: async (body: { templateId: string; fields: Record<string, string>; lists: Record<string, Record<string, string>[]>; colors: Record<string, string> }) => {
    const res = await fetch("/api/posts/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `${res.status} ${res.statusText}`);
    }
    return { blob: await res.blob(), savedPath: res.headers.get("X-Saved-Path") ?? "" };
  },
};
