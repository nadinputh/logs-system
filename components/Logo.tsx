import type { SVGProps } from 'react'

/**
 * Kamnotheat logo mark — a security shield with a verification check.
 *
 * Concept: the shield speaks to the platform's security spine (passkeys,
 * immutable audit ledger, anti-spoofing) while the check mark inside signals a
 * verified check-in. Drawn with `currentColor` so it inherits text colour and
 * works on any surface (gradient tile, light, dark, favicon).
 */
export function LogoMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...props}
    >
      {/* Shield */}
      <path
        d="M12 3 L19 5.6 V11.1 C19 15.6 16 18.9 12 21 C8 18.9 5 15.6 5 11.1 V5.6 Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {/* Verification check */}
      <path
        d="M8.7 11.7 L11 14 L15.5 9.2"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The brand glyph on its gradient tile — the primary lockup used in nav bars,
 * headers and the footer. Pass a Tailwind size via `className` (default size-10).
 */
export function LogoTile({ className = 'size-10' }: { className?: string }) {
  return (
    <span
      className={`gradient-primary relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white shadow-lg shadow-cyan-500/25 ${className}`}
    >
      <LogoMark className="h-[58%] w-[58%]" strokeWidth={1.9} />
    </span>
  )
}
