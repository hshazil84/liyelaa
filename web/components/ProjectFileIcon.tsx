"use client";

import { useId } from "react";

const MARK = "M0,118.24c0-6.08,2.28-11.05,6.83-14.94,4.56-3.88,9.7-5.82,15.44-5.82,4.72,0,8.61,1.35,11.64,4.05h1.52c2.36,0,3.54-1.01,3.54-3.04.67-2.03-.68-4.56-4.05-7.59-3.38-3.04-5.4-4.89-6.08-5.57-4.39-4.05-6.58-9.11-6.58-15.19,0-7.42,2.86-12.99,8.61-16.71,16.87-10.8,31.14-19.49,42.78-26.07,11.65-6.58,23.54-12.41,35.69-17.47,5.06-2.03,10.13-3.04,15.19-3.04,9.11,0,17.21,3.04,24.3,9.11,7.09,6.08,11.98,14.18,14.68,24.3.67,4.05,1.01,7.09,1.01,9.11,0,9.79-3.21,18.99-9.62,27.59-6.42,8.61-14.52,14.94-24.3,18.99-7.09,2.71-13.5,4.05-19.24,4.05-11.82,0-22.78-4.56-32.91-13.67,2.7,6.08,4.05,11.64,4.05,16.71,0,10.13-5.24,18.9-15.7,26.33-5.06,4.05-11.39,7.51-18.99,10.38-7.59,2.86-14.77,4.3-21.52,4.3s-11.9-1.61-16.45-4.81c-4.56-3.21-7.68-8.35-9.37-15.44-.34-1.35-.51-3.21-.51-5.57ZM115.44,51.15c-5.06,2.87-8.1,4.48-9.11,4.81,1.34,1.69,3.54,2.53,6.58,2.53,2.7,0,5.06-.67,7.09-2.03,2.03-1.35,3.04-3.37,3.04-6.08,0-2.36-2.53-2.1-7.59.76Z";

/** The project-file icon: a page with a folded corner and the ThaanaFont mark raised on it. Detail drops away as it gets small. */
export function ProjectFileIcon({ size = 40, label = false, className = "" }: { size?: number; label?: boolean; className?: string }) {
  const u = useId().replace(/:/g, "");
  const handle = size >= 56;
  return (
    <svg viewBox="-8 -6 216 272" width={size} height={size * 1.26} className={className} aria-hidden focusable="false" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`p${u}`} x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E4EFE8" /></linearGradient>
        <linearGradient id={`m${u}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4C7A46" /><stop offset="1" stopColor="#1F381C" /></linearGradient>
        <filter id={`s${u}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b" /><feOffset in="b" dy="5" result="o" />
          <feFlood floodColor="#264022" floodOpacity=".22" /><feComposite in2="o" operator="in" result="sh" />
          <feMerge><feMergeNode in="sh" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`b${u}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="bl" />
          <feDiffuseLighting in="bl" surfaceScale="3" diffuseConstant="1.05" lightingColor="#fff" result="d"><feDistantLight azimuth="235" elevation="55" /></feDiffuseLighting>
          <feComposite in="d" in2="SourceAlpha" operator="in" result="di" />
          <feBlend in="SourceGraphic" in2="di" mode="multiply" />
        </filter>
      </defs>
      <path d="M34 0H136L200 64V214Q200 248 166 248H34Q0 248 0 214V34Q0 0 34 0Z" fill={`url(#p${u})`} stroke="#CFE3D5" strokeWidth="2" filter={`url(#s${u})`} />
      <path d="M136 0L200 64H170Q136 64 136 30Z" fill="#D6EADC" stroke="#CFE3D5" strokeWidth="2" strokeLinejoin="round" />
      <g transform="translate(24 70) scale(.86)">
        <path d={MARK} fill={`url(#m${u})`} filter={`url(#b${u})`} />
        {handle && (
          <g stroke="#7F9A86" fill="#7F9A86">
            <line x1="70.61" y1="12.36" x2="170.59" y2="2.35" strokeWidth="1.6" />
            <rect x="116.11" y="2.66" width="9.6" height="9.6" transform="translate(32.05 -74.87) rotate(39.29)" fill="#fff" strokeWidth="1.4" />
          </g>
        )}
      </g>
      {label && <text x="100" y="226" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="15" letterSpacing="1.2" fill="#264022" opacity=".6">.thaanafont</text>}
    </svg>
  );
}
