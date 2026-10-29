import { useFlashClass } from "./useFlashClass";

interface Props {
  value: number;
  label: string;
  token: string | number;
}

/** Sidebar total with highlight when the value changes. */
export function AnimatedScore({ value, label, token }: Props) {
  const flash = useFlashClass(token);
  return (
    <div className={`score-total-cell ${flash}`}>
      <span className="score-label">{label}</span>
      <span className="score-value">{value}</span>
    </div>
  );
}
