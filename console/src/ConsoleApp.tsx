import { useCallback, useEffect, useRef, useState } from "react";
import { connectToBridgedGame } from "@bosco98/opencontrol-sdk";
import { CartridgeHost } from "./cartridge-host";
import { DeckSession, type RosterPlayer } from "./deck-session";
import { INPUT_HOME } from "./oc-messages";
import { loadRegistry, type GameEntry } from "./registry";
import { sounds, unlockAudio } from "./audio";
import { BootSplash } from "./screens/BootSplash";
import { GameStage } from "./screens/GameStage";
import { Library } from "./screens/Library";
import { Lobby } from "./screens/Lobby";
import type { MenuDirection } from "@bosco98/opencontrol-sdk";

type Phase = "boot" | "lobby" | "library" | "ingame";

const MAX_PLAYERS = 8;
const CURTAIN_MAX_MS = 3000;
const TOAST_MS = 3500;

/**
 * Orchestrates the deck: phase state machine, menu input dispatch (crown
 * phone + keyboard fallback), and the launch/eject lifecycle of cartridges.
 * All session/roster mechanics live in DeckSession; relaying lives in
 * CartridgeHost; screens only present.
 */
export function ConsoleApp() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [starting, setStarting] = useState(false);
  const [deck, setDeck] = useState<DeckSession | null>(null);
  const [games, setGames] = useState<GameEntry[]>([]);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [cursor, setCursor] = useState(0);
  const [activeGame, setActiveGame] = useState<GameEntry | null>(null);
  const [curtain, setCurtain] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Mirrors for values read inside long-lived input handlers.
  const phaseRef = useRef(phase);
  const cursorRef = useRef(cursor);
  const gamesRef = useRef(games);
  const rosterRef = useRef(roster);
  const activeGameRef = useRef(activeGame);
  const deckRef = useRef(deck);
  const cartridgeRef = useRef<CartridgeHost | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const moveCursorTo = (index: number) => {
    cursorRef.current = index;
    setCursor(index);
  };

  const showToast = (text: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  /* ---------------- power on ---------------- */

  const powerOn = async () => {
    setStarting(true);
    unlockAudio();
    void document.documentElement.requestFullscreen?.().catch(() => {});
    try {
      const [session, registry] = await Promise.all([DeckSession.create(), loadRegistry()]);
      gamesRef.current = registry;
      setGames(registry);
      deckRef.current = session;
      setDeck(session);

      let lastCount = 0;
      session.onRosterChange(() => {
        const next = session.roster;
        if (next.length > lastCount) sounds.join();
        else if (next.length < lastCount) sounds.leave();
        lastCount = next.length;
        rosterRef.current = next;
        setRoster(next);
      });
      session.onCrownInput(handleMenuInput);

      sounds.boot();
      goTo("lobby");
    } catch (err) {
      console.error(err);
      setStarting(false);
      showToast("Couldn't start the deck — check your connection and tap again");
    }
  };

  /* ---------------- menu input (crown phone; keyboard mirrors it) ---------------- */

  function handleMenuInput(event: string, data: unknown): void {
    switch (phaseRef.current) {
      case "lobby":
        if (event === "confirm") {
          sounds.confirm();
          goTo("library");
        }
        break;
      case "library":
        if (event === "navigate") navigate((data as { dir: MenuDirection }).dir);
        else if (event === "confirm") launch(gamesRef.current[cursorRef.current]);
        else if (event === "back") {
          sounds.back();
          goTo("lobby");
        }
        break;
      case "ingame":
        if (event === INPUT_HOME) eject();
        break;
      case "boot":
        break;
    }
  }

  function navigate(dir: MenuDirection): void {
    if (dir !== "left" && dir !== "right") return;
    const count = gamesRef.current.length;
    if (count === 0) return;
    sounds.move();
    moveCursorTo((cursorRef.current + (dir === "left" ? -1 : 1) + count) % count);
  }

  // Keyboard fallback so the deck is drivable without a phone during dev.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === "ArrowLeft") handleMenuInput("navigate", { dir: "left" });
      else if (key === "ArrowRight") handleMenuInput("navigate", { dir: "right" });
      else if (key === "Enter") handleMenuInput("confirm", {});
      else if (key === "Backspace") handleMenuInput("back", {});
      else if (key === "Escape" && phaseRef.current === "ingame") {
        // Phones in play own the eject decision; Esc only works without them.
        const anyConnected = rosterRef.current.some((p) => p.status === "connected");
        if (!anyConnected) eject();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- cartridge lifecycle ---------------- */

  function launch(game: GameEntry | undefined): void {
    if (!game || phaseRef.current === "ingame") return;
    sounds.launch();
    activeGameRef.current = game;
    setActiveGame(game);
    setCurtain(true);
    goTo("ingame");
  }

  // GameStage hands us the iframe element; the bridge handshake starts here.
  // Stable identity + per-element guard: React re-invokes callback refs when
  // their identity changes, and a second invocation for the same iframe must
  // not start a second bridge/relay.
  const bridgedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const handleIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    const game = activeGameRef.current;
    const session = deckRef.current;
    if (!iframe || !game || !session) return;
    if (bridgedIframeRef.current === iframe) return;
    bridgedIframeRef.current = iframe;

    void (async () => {
      try {
        const bridge = await connectToBridgedGame(iframe, { origin: game.origin });
        if (phaseRef.current !== "ingame" || activeGameRef.current !== game) {
          bridge.close();
          return;
        }
        const cartridge = new CartridgeHost(session.session, bridge, game.profile, {
          onGameClosed: () => eject("The game ended"),
          onFirstWelcome: () => setCurtain(false),
          onPlayerRejected: (player, reason) =>
            session.toast(player, reason === "full" ? "Game is full" : "Couldn't join this game"),
        });
        cartridgeRef.current = cartridge;
        cartridge.start();
        session.setProfile(game.profile);
        setTimeout(() => setCurtain(false), CURTAIN_MAX_MS);
      } catch (err) {
        console.error(err);
        eject("Couldn't start the game");
      }
    })();
  }, []);

  function eject(message?: string): void {
    cartridgeRef.current?.stop();
    cartridgeRef.current = null;
    bridgedIframeRef.current = null;
    activeGameRef.current = null;
    setActiveGame(null);
    setCurtain(false);
    deckRef.current?.setProfile("menu");
    sounds.back();
    goTo("library");
    if (message) showToast(message);
  }

  /* ---------------- render ---------------- */

  return (
    <div className="shell">
      {phase === "boot" && <BootSplash starting={starting} onPowerOn={() => void powerOn()} />}

      {phase !== "boot" && phase !== "ingame" && deck && (
        <div className="topbar">
          <div className="wordmark">
            <span className="opn">Opn</span>-gamedeck
          </div>
          <div className="room">
            ROOM <b>{deck.code}</b>
          </div>
        </div>
      )}

      {phase === "lobby" && deck && (
        <Lobby joinUrl={deck.joinUrl} roster={roster} maxPlayers={MAX_PLAYERS} />
      )}
      {phase === "library" && <Library games={games} cursor={cursor} />}
      {phase === "ingame" && activeGame && (
        <GameStage game={activeGame} curtain={curtain} onIframe={handleIframe} />
      )}

      {toast && <div className="shell-toast">{toast}</div>}
    </div>
  );
}
