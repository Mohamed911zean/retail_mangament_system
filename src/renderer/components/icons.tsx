/**
 * Icon set — outline icons in the Lucide style (24×24 box, 1.75 stroke, round
 * caps), inlined as SVG components.
 *
 * Design system §3.6 asks for Lucide geometry with only the used icons bundled.
 * Drawing them inline keeps the renderer dependency-free and the bundle tiny
 * (AGENTS.md §2/§10: weak PCs, every dependency needs a reason) and there is no
 * icon font to load. Add an icon here only when a screen needs it.
 *
 * Directional icons (back/next arrows) carry `icon-directional`, which mirrors
 * them in RTL. Logos, checkmarks and media controls must never use it (§6.3).
 */
import type { ReactNode, SVGProps } from 'react'
import { cn } from '../lib/cn'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** Rendered size in pixels. The scale is 16 / 20 (default) / 24 (§3.6). */
  size?: 16 | 20 | 24
  /** Arabic label, required when the icon is the only content of a button. */
  title?: string
}

function IconBase({ size = 20, title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title === undefined ? 'presentation' : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      focusable="false"
      {...rest}
    >
      {title !== undefined && <title>{title}</title>}
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </IconBase>
  )
}

export function CartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="18" cy="19" r="1.5" />
      <path d="M3 4h2.5l2.5 11h11l2-8H6" />
    </IconBase>
  )
}

export function BoxIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="m4 7 8 4 8-4" />
      <path d="M12 11v10" />
    </IconBase>
  )
}

export function TruckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2 7h11v9H2z" />
      <path d="M13 10h4l3 3v3h-7z" />
      <circle cx="6.5" cy="18" r="1.8" />
      <circle cx="16.5" cy="18" r="1.8" />
    </IconBase>
  )
}

export function ReceiptIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </IconBase>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 20c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" />
      <path d="M16 6.5a3 3 0 0 1 0 6" />
      <path d="M17.5 14.8c1.8.6 3 2.4 3 5.2" />
    </IconBase>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6" />
      <path d="M13 20V9" />
      <path d="M18 20v-9" />
    </IconBase>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" />
    </IconBase>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 4H6v16h8" />
      <path d="M17 8l4 4-4 4" />
      <path d="M21 12H10" />
    </IconBase>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </IconBase>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </IconBase>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </IconBase>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14" />
    </IconBase>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </IconBase>
  )
}

export function PrinterIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 9V4h10v5" />
      <path d="M5 9h14v8h-3v4H8v-4H5z" />
    </IconBase>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </IconBase>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 11h12v9H6z" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
    </IconBase>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </IconBase>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4.5 21 20H3z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4v.2" />
    </IconBase>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 8v.2" />
    </IconBase>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </IconBase>
  )
}

/** Directional: mirrored in RTL by the `icon-directional` class. */
export function ChevronStartIcon({ className, ...props }: IconProps) {
  return (
    <IconBase {...props} className={cn('icon-directional', className)}>
      <path d="m14 6-6 6 6 6" />
    </IconBase>
  )
}

/** Suppliers: a shop front, so it never reads as "customers". */
export function StoreIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 9h16v11H4z" />
      <path d="M3 9l1.6-5h14.8L21 9" />
      <path d="M9.5 20v-6h5v6" />
    </IconBase>
  )
}

/** Money/wallet, for payments and the treasury. */
export function WalletIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v2.5" />
      <path d="M4 7.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5H6.5A2.5 2.5 0 0 1 4 7.5Z" />
      <circle cx="16" cy="14" r="1.25" />
    </IconBase>
  )
}

