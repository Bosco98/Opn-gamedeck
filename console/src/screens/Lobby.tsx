import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import type { RosterPlayer } from "../deck-session";

interface Props {
  joinUrl: string;
  roster: RosterPlayer[];
  maxPlayers: number;
}

/** Join screen: QR + room code on the left, live player roster on the right. */
export function Lobby({ joinUrl, roster, maxPlayers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, joinUrl, { width: 220, margin: 0 });
    }
  }, [joinUrl]);

  return (
    <div className="lobby">
      <div className="join-card">
        <canvas ref={canvasRef} />
        <div className="url">{joinUrl}</div>
      </div>

      <div className="players">
        <h2>
          Players {roster.length}/{maxPlayers}
        </h2>
        {roster.map((player) => (
          <div
            key={player.id}
            className={`player-chip${player.status === "reconnecting" ? " reconnecting" : ""}`}
          >
            <span className="dot" style={{ background: player.color }} />
            <span className="who">
              {player.crown ? "👑 " : ""}
              {player.name}
            </span>
            <span className="tag">
              {player.status === "reconnecting" ? "RECONNECTING" : `P${player.index + 1}`}
            </span>
          </div>
        ))}
        {roster.length === 0 && <div className="empty-slots">Scan the code to plug in</div>}
      </div>

      <div className="hint">
        {roster.length === 0 ? (
          <>Scan with your phone — it becomes the controller</>
        ) : (
          <>
            <b>P1</b> press <b>A</b> to open the game library
          </>
        )}
      </div>
    </div>
  );
}
