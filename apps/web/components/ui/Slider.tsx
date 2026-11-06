interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}

export function Slider({ label, value, min, max, step = 1, format = String, onChange, hint }: SliderProps) {
  const id = `slider-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-neutral-300">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-base font-semibold text-white tabular-nums">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {hint ? <p className="-mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export function formatDuration(secs: number): string {
  if (secs === 0) return "None";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
