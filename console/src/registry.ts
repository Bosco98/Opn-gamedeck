/**
 * The game registry: which cartridges this deck can launch.
 *
 * `games.json` entries use URLs relative to the console's own location for
 * local games ("platformer/") and absolute https URLs for games hosted on
 * other origins. Everything is resolved here so the rest of the app only
 * ever sees absolute URLs plus the origin to validate the bridge against.
 */

export interface GameEntry {
  id: string;
  title: string;
  tagline?: string;
  /** Resolved cover image URL. */
  cover: string;
  /** Resolved game page URL (without the console marker). */
  url: URL;
  /** Origin the bridge handshake must come from. */
  origin: string;
  /** Controller profile the game hosts with (its `OpenControl.host` option). */
  profile: string;
  maxPlayers?: number;
}

interface RawEntry {
  id?: unknown;
  title?: unknown;
  tagline?: unknown;
  cover?: unknown;
  url?: unknown;
  profile?: unknown;
  maxPlayers?: unknown;
}

export async function loadRegistry(): Promise<GameEntry[]> {
  const response = await fetch(new URL("games.json", document.baseURI));
  if (!response.ok) throw new Error(`games.json: HTTP ${response.status}`);
  const body = (await response.json()) as { games?: unknown };
  const raw = Array.isArray(body.games) ? (body.games as RawEntry[]) : [];
  return raw.flatMap((entry) => {
    const parsed = parseEntry(entry);
    if (!parsed) console.warn("games.json: skipping malformed entry", entry);
    return parsed ? [parsed] : [];
  });
}

function parseEntry(raw: RawEntry): GameEntry | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.url !== "string" ||
    typeof raw.profile !== "string"
  ) {
    return null;
  }
  try {
    const url = new URL(raw.url, document.baseURI);
    return {
      id: raw.id,
      title: raw.title,
      tagline: typeof raw.tagline === "string" ? raw.tagline : undefined,
      cover: new URL(typeof raw.cover === "string" ? raw.cover : "", document.baseURI).toString(),
      url,
      origin: url.origin,
      profile: raw.profile,
      maxPlayers: typeof raw.maxPlayers === "number" ? raw.maxPlayers : undefined,
    };
  } catch {
    return null;
  }
}
