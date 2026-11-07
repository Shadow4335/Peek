/** Peek! mascot: soft rounded blob with two eyes and a tiny smile. Decorative only. */
export function Mascot({
  size = 72,
  tone = "accent",
  float = false,
  className = "",
}: {
  size?: number;
  tone?: "accent" | "primary" | "hider";
  float?: boolean;
  className?: string;
}) {
  const fill = { accent: "#b6cd91", primary: "#8878cb", hider: "#c58f87" }[tone];
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={`${float ? "motion-safe:animate-[peek-float_2.8s_ease-in-out_infinite]" : ""} ${className}`}
    >
      <path d="M60 10c26 0 44 19 44 46 0 25-17 44-44 44S16 81 16 56c0-27 18-46 44-46z" fill={fill} />
      <ellipse cx="46" cy="54" rx="8" ry="10" fill="#22271e" />
      <ellipse cx="74" cy="54" rx="8" ry="10" fill="#22271e" />
      <circle cx="48.5" cy="51" r="2.6" fill="#f0eee9" />
      <circle cx="76.5" cy="51" r="2.6" fill="#f0eee9" />
      <path d="M53 73c4 4 10 4 14 0" stroke="#22271e" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
