/** Simple animated scene for the empty column beside the login form: a solar
 * house + battery, echoing SolaXCloud's own login page composition (big
 * illustration + form side by side) but flat/minimal instead of a 3D render,
 * and in the app's own teal palette instead of SolaX's orange. Pure inline
 * SVG (no image asset) so it stays crisp at any size and themes automatically
 * with light/dark via currentColor + Tailwind color utilities. */
export function LoginIllustration() {
  return (
    <div aria-hidden="true" className="login-illustration flex w-full max-w-md items-center justify-center">
      <svg viewBox="0 0 400 320" className="h-auto w-full" role="presentation">
        <ellipse cx="200" cy="270" rx="150" ry="16" className="fill-primary/10" />

        {/* Sun: slow pulse behind the rays */}
        <g className="animate-[login-pulse_4s_ease-in-out_infinite]">
          <circle cx="300" cy="70" r="34" className="fill-primary/15" />
        </g>
        <circle cx="300" cy="70" r="22" className="fill-primary" />
        <g className="stroke-primary/70 animate-[login-spin_18s_linear_infinite]" style={{ transformOrigin: '300px 70px' }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * Math.PI) / 4;
            const x1 = 300 + Math.cos(angle) * 30;
            const y1 = 70 + Math.sin(angle) * 30;
            const x2 = 300 + Math.cos(angle) * 40;
            const y2 = 70 + Math.sin(angle) * 40;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={3} strokeLinecap="round" />;
          })}
        </g>

        {/* House with a tilted solar panel roof */}
        <g>
          <rect x="90" y="170" width="140" height="100" rx="6" className="fill-secondary" />
          <path d="M78 172 L160 118 L242 172 Z" className="fill-primary" />
          <rect x="98" y="178" width="118" height="30" rx="3" className="fill-primary/20" />
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={i} x1={98 + i * 23.6} y1="178" x2={98 + i * 23.6} y2="208" className="stroke-primary/50" strokeWidth={1.5} />
          ))}
          <rect x="150" y="215" width="30" height="55" rx="2" className="fill-primary/25" />
          <rect x="115" y="220" width="26" height="26" rx="2" className="fill-primary/35" />
        </g>

        {/* Battery pack, gently floating */}
        <g className="animate-[login-float_5s_ease-in-out_infinite]">
          <rect x="255" y="205" width="52" height="66" rx="8" className="fill-primary" />
          <rect x="271" y="196" width="20" height="12" rx="3" className="fill-primary" />
          <path d="M283 220 L268 240 L279 240 L275 258 L295 233 L282 233 Z" className="fill-primary-foreground" />
        </g>

        {/* Drifting accent dots */}
        <circle cx="60" cy="90" r="5" className="fill-primary/50 animate-[login-float_6s_ease-in-out_infinite]" />
        <circle cx="340" cy="200" r="4" className="fill-primary/40 animate-[login-float_7s_ease-in-out_infinite_1s]" />
        <circle cx="100" cy="140" r="3" className="fill-primary/30 animate-[login-float_5.5s_ease-in-out_infinite_0.5s]" />
      </svg>
    </div>
  );
}
