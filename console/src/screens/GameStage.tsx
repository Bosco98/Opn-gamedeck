import { useMemo } from "react";
import { withConsoleParam } from "@bosco98/opencontrol-sdk";
import type { GameEntry } from "../registry";

interface Props {
  game: GameEntry;
  curtain: boolean;
  onIframe: (iframe: HTMLIFrameElement | null) => void;
}

/** Fullscreen cartridge iframe + loading curtain + fading exit hint. */
export function GameStage({ game, curtain, onIframe }: Props) {
  const src = useMemo(() => withConsoleParam(new URL(game.url)).toString(), [game]);

  return (
    <>
      <iframe
        key={game.id}
        ref={onIframe}
        className="stage-frame"
        src={src}
        title={game.title}
        allow="autoplay; fullscreen; vibrate"
      />
      {curtain && (
        <div className="curtain">
          <div className="wordmark">
            <span className="opn">Opn</span>-gamedeck
          </div>
          <div className="loading">Inserting {game.title}…</div>
        </div>
      )}
      {!curtain && <div className="stage-hint">P1 holds ⌂ to eject</div>}
    </>
  );
}
