interface Props {
  starting: boolean;
  onPowerOn: () => void;
}

/**
 * Power-on screen. The click doubles as the user gesture that unlocks
 * audio and (best-effort) fullscreen.
 */
export function BootSplash({ starting, onPowerOn }: Props) {
  return (
    <div className="boot" onClick={starting ? undefined : onPowerOn}>
      <div className="wordmark">
        <span className="opn">Opn</span>-gamedeck
      </div>
      <div className="tagline">Phones in. Games on.</div>
      <div className="power">{starting ? "Powering on…" : "▶ Tap to power on"}</div>
    </div>
  );
}
