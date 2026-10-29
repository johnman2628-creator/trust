import type { Move } from "@trust/shared";

interface Props {
  onCooperate: () => void;
  onCheat: () => void;
  disabled?: boolean;
}

/**
 * Cooperate / Cheat buttons with subtle idle pulse (individual PD modes).
 */
export function PdMoveButtons({ onCooperate, onCheat, disabled }: Props) {
  return (
    <div className={`row move-row move-row-choose${disabled ? " move-row-disabled" : ""}`}>
      <button
        type="button"
        className="coop-btn pd-move-btn"
        onClick={onCooperate}
        disabled={disabled}
      >
        Cooperate
      </button>
      <button type="button" className="cheat-btn pd-move-btn" onClick={onCheat} disabled={disabled}>
        Cheat
      </button>
    </div>
  );
}

export type { Move };
