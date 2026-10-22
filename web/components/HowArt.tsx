const INK = "#264022";
const LINE = "#CFD9D2";
const ORANGE = "#FA7E00";
const MUTED = "#5D797B";
const stroke = { stroke: LINE, strokeWidth: 1.5 } as const;
const line = { fill: "none", ...stroke } as const;
const inkLine = { fill: "none", stroke: INK, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const orLine = { fill: "none", stroke: ORANGE, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const th = "font-sangu";

/** Small pictures of the three steps. Drawn here so they stay sharp at any size and need no image files. */
export function HowArt({ step, label }: { step: 1 | 2 | 3; label?: string }) {
  return (
    <svg viewBox="0 0 240 150" className="block h-auto w-full" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {step === 1 && (
        <>
          <g>
            <rect x="12" y="22" width="68" height="108" rx="10" fill="#fff" {...stroke} />
            <rect x="22" y="32" width="26" height="5" rx="2.5" fill={INK} />
            <text x="46" y="82" textAnchor="middle" fontSize="62" className={th} fill={INK}>ދި</text>
            <rect x="22" y="104" width="48" height="14" rx="7" fill={INK} />
          </g>
          <g>
            <rect x="86" y="22" width="68" height="108" rx="10" fill="#fff" stroke={ORANGE} strokeWidth="2.5" />
            <rect x="96" y="32" width="26" height="5" rx="2.5" fill={INK} />
            <rect x="102" y="48" width="36" height="46" {...line} />
            <path d="M102 60H138M102 72H138M102 84H138M114 48V94M126 48V94" {...line} />
            <text x="120" y="68" textAnchor="middle" fontSize="32" className={th} fill={INK}>ގ</text>
            <rect x="96" y="104" width="48" height="14" rx="7" fill={INK} />
          </g>
          <g>
            <rect x="160" y="22" width="68" height="108" rx="10" fill="#fff" {...stroke} />
            <rect x="170" y="32" width="26" height="5" rx="2.5" fill={INK} />
            <path d="M172 88C182 46 204 48 206 70S214 90 218 62" {...inkLine} />
            <rect x="168" y="84" width="8" height="8" fill="#fff" stroke={ORANGE} strokeWidth="2" />
            <rect x="202" y="66" width="8" height="8" fill="#fff" stroke={ORANGE} strokeWidth="2" />
            <rect x="170" y="104" width="48" height="14" rx="7" fill={INK} />
          </g>
          <path d="M128 112l0-18 6 5 4-9 4 2-4 9 8 0z" fill={INK} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      )}
      {step === 2 && (
        <>
          <g transform="rotate(-4 66 76)">
            <rect x="14" y="12" width="104" height="128" rx="5" fill="#fff" {...stroke} />
            <rect x="19" y="17" width="8" height="8" fill={INK} /><rect x="105" y="17" width="8" height="8" fill={INK} />
            <rect x="19" y="127" width="8" height="8" fill={INK} /><rect x="105" y="127" width="8" height="8" fill={INK} />
            <rect x="32" y="30" width="68" height="90" {...line} />
            <path d="M49 30V120M66 30V120M83 30V120M32 48H100M32 66H100M32 84H100M32 102H100" {...line} />
            <text x="40.5" y="62" textAnchor="middle" fontSize="32" className={th} fill={INK}>ގ</text>
            <text x="57.5" y="44" textAnchor="middle" fontSize="32" className={th} fill={INK}>ބ</text>
            <text x="74.5" y="80" textAnchor="middle" fontSize="32" className={th} fill={INK}>ދ</text>
            <text x="91.5" y="98" textAnchor="middle" fontSize="32" className={th} fill={INK}>ކ</text>
            <text x="40.5" y="116" textAnchor="middle" fontSize="32" className={th} fill={INK}>ލ</text>
          </g>
          <path d="M124 76h20m-6-6l6 6-6 6" {...orLine} />
          <rect x="150" y="8" width="76" height="134" rx="14" fill="#fff" stroke={INK} strokeWidth="3" />
          <rect x="178" y="13" width="20" height="4" rx="2" fill={INK} />
          <rect x="158" y="26" width="60" height="92" rx="4" fill="#DCE8DF" opacity=".5" />
          <path d="M162 40v-10h10M214 30h-10M204 30h10v10M162 104v10h10M214 114h-10M214 114v-10" {...orLine} />
          <rect x="169" y="44" width="38" height="52" {...line} />
          <path d="M182 44V96M194 44V96M169 61H207M169 78H207" {...line} />
          <text x="175.5" y="74" textAnchor="middle" fontSize="22" className={th} fill={INK}>ގ</text>
          <circle cx="188" cy="130" r="6" fill={ORANGE} />
        </>
      )}
      {step === 3 && (
        <>
          <rect x="14" y="12" width="212" height="126" rx="12" fill="#fff" {...stroke} />
          <circle cx="28" cy="25" r="3.5" fill="#DCE8DF" /><circle cx="40" cy="25" r="3.5" fill="#DCE8DF" /><circle cx="52" cy="25" r="3.5" fill="#DCE8DF" />
          <path d="M14 38H226" {...line} />
          <text x="120" y="82" textAnchor="middle" fontSize="70" fill={INK} style={{ fontFamily: "Hawwa, sans-serif" }}>ތާނަ ފޮންޓު</text>
          <path d="M72 94H168" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 5" />
          <rect x="26" y="108" width="36" height="20" rx="6" {...line} />
          <text x="44" y="122" textAnchor="middle" fontSize="9" fontWeight="700" fill={MUTED}>TTF</text>
          <rect x="68" y="108" width="46" height="20" rx="6" {...line} />
          <text x="91" y="122" textAnchor="middle" fontSize="9" fontWeight="700" fill={MUTED}>WOFF2</text>
          <rect x="132" y="106" width="84" height="24" rx="8" fill={INK} />
          <path d="M146 113v8m-4-4l4 4 4-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="154" y="122" fontSize="11" fontWeight="700" fill="#fff">Download</text>
        </>
      )}
    </svg>
  );
}

export const HOW_STEPS = [
  { n: 1 as const, title: "Pick a way to start", text: "Play with a font, make one from your handwriting, or draw your own letters.", short: "Play with a font, use your handwriting, or draw.", alt: "Three cards: play with a font, handwriting, draw" },
  { n: 2 as const, title: "Make your letters", text: "Write them on our template and take a photo, or draw them in the editor. Tidy each one and set the spacing.", short: "Photo of a filled-in template, or draw in the editor.", alt: "A printed template and a phone taking a photo of it" },
  { n: 3 as const, title: "Test and download", text: "Type Dhivehi with your font to check it, then download a font file you can install.", short: "Check it with real Dhivehi, then get your font file.", alt: "Dhivehi text in the new font and a download button" },
];
