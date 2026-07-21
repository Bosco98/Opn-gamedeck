import type { GameEntry } from "../registry";

interface Props {
  games: GameEntry[];
  cursor: number;
}

/** Cartridge shelf: cover cards, one selected by the crown's d-pad. */
export function Library({ games, cursor }: Props) {
  return (
    <div className="library">
      <h2>Game Library</h2>
      <div className="cards">
        {games.map((game, index) => (
          <div key={game.id} className={`card${index === cursor ? " selected" : ""}`}>
            <img src={game.cover} alt="" draggable={false} />
            <div className="meta">
              <h3>{game.title}</h3>
              {game.tagline && <p>{game.tagline}</p>}
              <span className="profile-tag">{game.profile} controller</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hint">
        <b>P1</b>: ◀ ▶ browse · <b>A</b> play · <b>B</b> back
      </div>
    </div>
  );
}
