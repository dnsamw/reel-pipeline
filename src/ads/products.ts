/**
 * What the ads sell - the product facts from the Facebook ads plan
 * (study-pal-eng-book/english-book-content/marketing/facebook-ads-plan.md,
 * Parts 1, 2 and 12.2). Same data as the BOOKS/PACKS arrays in the
 * ad-templates/*.html designs, plus the copy-bank headlines. Phrase counts in
 * `phrasesLabel` are rounded down, so every claim stays true.
 */

export interface AdBook {
  n: number;
  en: string;
  enSub: string;
  si: string;
  phrases: number;
  phrasesLabel: string;
  volumes: number;
  accent: string;
  tint: string;
  /** Short title for the C1 bookshelf spines. */
  spine: string;
  /** Flat 2:3 cover, assets/-relative (assets/ads/covers/). */
  cover: string;
  /** Copy bank (Part 12.2) - Sinhala hook marked (review) in the plan. */
  hook: string;
  hookEn: string;
  /** Ads Manager headline, <= 40 chars. */
  headline: string;
}

export interface AdPack {
  id: string;
  name: string;
  nameSi: string;
  books: number[];
  phrases: number;
  phrasesLabel: string;
  volumes: number;
  hook: string;
  hookEn: string;
  headline: string;
}

export const BOOKS: AdBook[] = [
  { n: 1, en: "Just Start Talking", enSub: "Confidence Kit", si: "කතා කරන්න පටන් ගනිමු", phrases: 2888, phrasesLabel: "2,800+", volumes: 9, accent: "#C2410C", tint: "#FFEDE4", spine: "Just Start Talking", cover: "ads/covers/book-01-just-start-talking.png", hook: "ඉංග්‍රීසි තේරෙනවා, ඒත් කතා කරන්න බයද?", hookEn: "Understand English but freeze when you speak?", headline: "Start speaking English today" },
  { n: 2, en: "Everyday English", enSub: "Foundations", si: "එදිනෙදා ඉංග්‍රීසි", phrases: 2200, phrasesLabel: "2,200", volumes: 8, accent: "#15803D", tint: "#E3F4E8", spine: "Everyday English", cover: "ads/covers/book-02-everyday-english.png", hook: "එදිනෙදා ජීවිතයට ඕන ඉංග්‍රීසි, එක පොතක.", hookEn: "The English you need every single day", headline: "2,200 everyday phrases" },
  { n: 3, en: "Getting Things Done", enSub: "Banks, Clinics, Hotels & Travel", si: "වැඩ කටයුතු කරගැනීම", phrases: 2602, phrasesLabel: "2,600+", volumes: 8, accent: "#0F766E", tint: "#DDF3EF", spine: "Getting Things Done", cover: "ads/covers/book-03-getting-things-done.png", hook: "බැංකුවේ, හොස්පිට්ල් එකේ, හෝටලයේ, කියන්න ඕන දේ.", hookEn: "Know exactly what to say at the bank, clinic or hotel", headline: "Banks, clinics, hotels & travel" },
  { n: 4, en: "Working Abroad", enSub: "Visas, Interviews & Jobs", si: "විදේශගත රැකියා", phrases: 5500, phrasesLabel: "5,500", volumes: 9, accent: "#1E3A8A", tint: "#E6EBF7", spine: "Working Abroad", cover: "ads/covers/book-04-working-abroad.png", hook: "විදේශ රැකියාවකට ලෑස්තිද?", hookEn: "Ready to work abroad?", headline: "5,500 phrases for working abroad" },
  { n: 5, en: "Digital Life, AI & Modern World", enSub: "", si: "ඩිජිටල් ජීවිතය, AI සහ නූතන ලෝකය", phrases: 2076, phrasesLabel: "2,000+", volumes: 7, accent: "#6D28D9", tint: "#EEE7FC", spine: "Digital Life & AI", cover: "ads/covers/book-05-digital-life-ai-modern-world.png", hook: "Text, social media, AI: ඔක්කොම ඉංග්‍රීසියෙන්.", hookEn: "Text, post and use AI in English with confidence", headline: "English for the online world" },
  { n: 6, en: "Love, Flirting & Social Confidence", enSub: "", si: "ආදරය, ආලවන්ත හැඟීම් පෑම සහ සමාජයීය විශ්වාසය", phrases: 1600, phrasesLabel: "1,600", volumes: 8, accent: "#BE185D", tint: "#FCE7EF", spine: "Social Confidence", cover: "ads/covers/book-06-love-flirting-social-confidence.png", hook: "විශ්වාසයෙන් කතාව පටන් ගන්න.", hookEn: "Start conversations with confidence", headline: "Social confidence in English" },
  { n: 7, en: "Standing Your Ground", enSub: "Conflict, Safety & Respect", si: "ආත්මගෞරවය රැකගැනීම", phrases: 1400, phrasesLabel: "1,400", volumes: 6, accent: "#B91C1C", tint: "#FDE8E8", spine: "Standing Your Ground", cover: "ads/covers/book-07-standing-your-ground.png", hook: "ගෞරවයෙන්, ස්ථිරව කතා කරන්න.", hookEn: "Stand your ground, calmly and clearly", headline: "Speak up with respect" },
  { n: 8, en: "Real Talk (18+)", enSub: "Slang, Swearing & Street Register", si: "සිරා කතාව", phrases: 1200, phrasesLabel: "1,200", volumes: 5, accent: "#1C1917", tint: "#ECEAE8", spine: "Real Talk", cover: "ads/covers/book-08-real-talk.png", hook: "", hookEn: "Never get caught off guard by slang again", headline: "Real-world slang, explained (18+)" },
  { n: 9, en: "Raising Kids in English", enSub: "Family & Parenting", si: "දෙමාපියන් සහ පවුල", phrases: 1200, phrasesLabel: "1,200", volumes: 4, accent: "#A16207", tint: "#FDF3D6", spine: "Raising Kids", cover: "ads/covers/book-09-raising-kids-in-english.png", hook: "දරුවා එක්ක ගෙදරදීම ඉංග්‍රීසියෙන් කතා කරමු.", hookEn: "Bring English into your home", headline: "English for parents & kids" },
  { n: 10, en: "Silver Surfers", enSub: "Everyday English for Seniors", si: "වැඩිහිටි අපට", phrases: 900, phrasesLabel: "900", volumes: 5, accent: "#6B3F7A", tint: "#F1E9F4", spine: "Silver Surfers", cover: "ads/covers/book-10-silver-surfers.png", hook: "අම්මාට, තාත්තාට, ඉංග්‍රීසියෙන් කතා කරන්න පුළුවන් තෑග්ගක්.", hookEn: "A gift of confidence for your parents", headline: "Everyday English for every generation" },
];

export const PACKS: AdPack[] = [
  { id: "PKSTART", name: "Starter Pack", nameSi: "පටන් ගන්න", books: [1, 2, 3], phrases: 7690, phrasesLabel: "7,600+", volumes: 25, hook: "පටන් ගන්න හොඳම තැන. පොත් 3ක්, එක මිලක්.", hookEn: "The best place to start: 3 books, one price", headline: "Starter Pack: 3 books, one price" },
  { id: "PKABROAD", name: "Going Abroad Pack", nameSi: "විදේශ ගමනට", books: [3, 4, 7], phrases: 9502, phrasesLabel: "9,500+", volumes: 23, hook: "වීසා interview එකේ ඉඳන් වැඩබිමට.", hookEn: "From visa interview to your first shift", headline: "Going Abroad Pack" },
  { id: "PKSOCIAL", name: "Social Confidence Pack", nameSi: "", books: [1, 5, 6], phrases: 6564, phrasesLabel: "6,500+", volumes: 24, hook: "", hookEn: "Talk, text and connect with confidence, online and in person", headline: "Social Confidence Pack" },
  { id: "PKFAMILY", name: "Family Pack", nameSi: "පවුලටම", books: [2, 9, 10], phrases: 4300, phrasesLabel: "4,300", volumes: 17, hook: "පවුලේ හැමෝටම ඉංග්‍රීසි.", hookEn: "English for the whole family", headline: "Family Pack: 3 books" },
];

/** Copy bank universal value line (Part 12.1, review): "Every English phrase with Sinhala-script pronunciation, meaning and explanation." */
export const VALUE_LINE_SI = "හැම ඉංග්‍රීසි වාක්‍යයකටම සිංහල අකුරෙන් උච්චාරණය, තේරුම සහ පැහැදිලි කිරීම.";

export const COLLECTION = {
  phrasesLabel: "21,000+",
  books: 10,
  volumes: 69,
  hook: "පොත් 10ක්. වාක්‍ය 21,000+. හැම තැනටම.",
  hookEn: "10 books. 21,000+ phrases. Every situation.",
  headline: "The complete collection",
};

/** What one ad is about - code is the plan's product code (Part 4.5): B01-B10, PKSTART..., ALL. */
export type AdProduct =
  | { kind: "book"; code: string; label: string; book: AdBook }
  | { kind: "pack"; code: string; label: string; pack: AdPack }
  | { kind: "collection"; code: "ALL"; label: string };

export type AdProductKind = AdProduct["kind"];

export const bookCode = (n: number) => `B${String(n).padStart(2, "0")}`;

export function bookByNumber(n: number): AdBook {
  return BOOKS[Math.min(10, Math.max(1, Math.round(Number(n)) || 1)) - 1];
}

export function productsOfKind(kind: AdProductKind): AdProduct[] {
  if (kind === "book") return BOOKS.map((book) => ({ kind, code: bookCode(book.n), label: `Book ${book.n} · ${book.en}`, book }));
  if (kind === "pack") return PACKS.map((pack) => ({ kind, code: pack.id, label: pack.name, pack }));
  return [{ kind: "collection", code: "ALL", label: "Complete collection" }];
}

/** Falls back to the first product of `kind` for an unknown code. */
export function getProduct(kind: AdProductKind, code: string): AdProduct {
  const all = productsOfKind(kind);
  return all.find((p) => p.code === code) ?? all[0];
}

export const hasSinhala = (s: string | undefined) => /[඀-෿]/.test(s ?? "");
