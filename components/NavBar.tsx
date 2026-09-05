'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import { Avatar, Chip, Dropdown, Header, Separator } from '@heroui/react'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/sonner'
import type { LucideIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { LogoTile } from '@/components/Logo'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Building2,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Home,
  Layers3,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'

type NavigationItem = {
  href: string
  label: string
  description: string
  Icon: LucideIcon
}

// Raw defs carry translation keys, not strings — the array itself lives at
// module scope (outside the component) so it isn't rebuilt every render, but
// resolving labelKey/descriptionKey into actual text needs useTranslations,
// which only works inside the component. See resolveNavItem() below.
type NavigationItemDef = {
  href: string
  labelKey: string
  descriptionKey: string
  Icon: LucideIcon
}

type DropdownKey = 'locations' | 'account' | 'menu'

type TeamSummary = {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'manager' | 'member' | 'auditor'
  isActive: boolean
}

const primaryItemDefs: NavigationItemDef[] = [
  { href: '/dashboard', labelKey: 'dashboard', descriptionKey: 'dashboardDesc', Icon: Home },
  { href: '/logs', labelKey: 'myLogs', descriptionKey: 'myLogsDesc', Icon: ClipboardList },
]

const locationItemDefs: NavigationItemDef[] = [
  { href: '/admin/buildings', labelKey: 'buildings', descriptionKey: 'buildingsDesc', Icon: Building2 },
  { href: '/admin/floors', labelKey: 'floors', descriptionKey: 'floorsDesc', Icon: Layers3 },
  { href: '/admin/rooms', labelKey: 'rooms', descriptionKey: 'roomsDesc', Icon: DoorOpen },
]

const adminItemDefs: NavigationItemDef[] = [
  { href: '/admin/quests', labelKey: 'quests', descriptionKey: 'questsDesc', Icon: Sparkles },
  { href: '/admin/logs', labelKey: 'allLogs', descriptionKey: 'allLogsDesc', Icon: ShieldCheck },
]

// Passkeys and Security used to be two separate settings pages reached from
// two separate menu items; they shared one mental model ("how do I get into
// my account") and are now one merged page at /settings/security.
const securityItemDef: NavigationItemDef = {
  href: '/settings/security',
  labelKey: 'security',
  descriptionKey: 'securityDesc',
  Icon: ShieldCheck,
}

const teamAccessItemDef: NavigationItemDef = {
  href: '/settings/team',
  labelKey: 'teamAccess',
  descriptionKey: 'teamAccessDesc',
  Icon: Users,
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navigationClass(active: boolean) {
  return [
    'group inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/30 [&_svg]:text-current',
    active
      ? 'bg-accent/10 text-accent ring-1 ring-accent/15'
      : 'text-muted hover:bg-accent/10 hover:text-accent hover:ring-1 hover:ring-accent/10 data-[hovered]:bg-accent/10 data-[hovered]:text-accent data-[hovered]:ring-1 data-[hovered]:ring-accent/10',
  ].join(' ')
}

function menuItemClass(active: boolean) {
  return [
    'group rounded-xl px-3 py-2 outline-none transition-colors focus:bg-accent/10 focus:text-accent [&_svg]:text-current',
    active ? 'bg-accent/10 text-accent ring-1 ring-accent/15' : 'text-foreground hover:bg-accent/10 hover:text-accent data-[hovered]:bg-accent/10 data-[hovered]:text-accent',
  ].join(' ')
}

function iconTileClass(active: boolean) {
  return [
    'flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors',
    active
      ? 'bg-accent/10 text-accent ring-accent/15'
      : 'bg-default/50 text-muted ring-border/50 group-hover:bg-accent/10 group-hover:text-accent group-hover:ring-accent/15 group-data-[hovered]:bg-accent/10 group-data-[hovered]:text-accent group-data-[hovered]:ring-accent/15',
  ].join(' ')
}

function useHoverDropdown(
  key: DropdownKey,
  openDropdown: DropdownKey | null,
  setOpenDropdown: Dispatch<SetStateAction<DropdownKey | null>>,
  closeDelay = 220
) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const isOpen = openDropdown === key

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function open() {
    clearCloseTimer()
    setOpenDropdown(key)
  }

  function updatePointerPosition(event: MouseEvent | PointerEvent | ReactMouseEvent | ReactPointerEvent) {
    pointerRef.current = { x: event.clientX, y: event.clientY }
  }

  function isPointInside(element: HTMLElement | null, margin = 8) {
    if (!element) return false

    const rect = element.getBoundingClientRect()
    const { x, y } = pointerRef.current

    return (
      x >= rect.left - margin &&
      x <= rect.right + margin &&
      y >= rect.top - margin &&
      y <= rect.bottom + margin
    )
  }

  function isPointerInsideDropdown() {
    return isPointInside(triggerRef.current) || isPointInside(popoverRef.current)
  }

  function closeSoon() {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      if (!isPointerInsideDropdown()) {
        setOpenDropdown((current) => (current === key ? null : current))
      }
    }, closeDelay)
  }

  function handleHoverEnter(event: ReactMouseEvent | ReactPointerEvent) {
    updatePointerPosition(event)
    open()
  }

  function handleHoverLeave(event: ReactMouseEvent | ReactPointerEvent) {
    updatePointerPosition(event)
    closeSoon()
  }

  // react-aria's own MenuTrigger owns press (click/tap/Enter/Space), Escape,
  // and outside-click dismissal for a controlled Dropdown — this only needs
  // to react to those calls, never to intercept pointerdown itself. An
  // earlier version hijacked pointerdown at the window level to hand-roll
  // click-to-toggle, which fought the library's own dismiss handling and
  // could leave a popover open with the rest of the page unresponsive to
  // clicks. Focus-restore-on-close is NOT handled by the library here (live-
  // verified: a real Escape after a real keyboard-driven open still leaves
  // focus on <body>, not the trigger) — likely because the popover is
  // conditionally unmounted by our own `isOpen &&` render rather than kept
  // mounted and hidden, which is what the library's own restore-focus effect
  // expects to still be there when it runs. Restoring it explicitly here.
  function handleOpenChange(openState: boolean) {
    clearCloseTimer()
    setOpenDropdown((current) => {
      if (openState) return key
      return current === key ? null : current
    })
    if (!openState) {
      // A synchronous focus() call here loses a race with react-aria's own
      // FocusScope unmount cleanup (it runs after this callback returns, and
      // unconditionally moves focus itself) — deferring to a macrotask lets
      // our call run last and actually stick. Captured now, before the
      // popover — and this ref's target — could change on the next render.
      const button = triggerRef.current?.querySelector<HTMLButtonElement>('[data-slot="dropdown-trigger"]')
      if (button) setTimeout(() => button.focus(), 0)
    }
  }

  useEffect(() => {
    if (!isOpen) return undefined

    // Batch the getBoundingClientRect reads to one per frame: pointermove fires
    // far faster than 60fps, and a single pointermove covers mouse/pen/touch, so
    // the old duplicate mousemove listener just doubled the layout work.
    let frame = 0

    function evaluate() {
      frame = 0
      if (isPointerInsideDropdown()) {
        clearCloseTimer()
      } else {
        closeSoon()
      }
    }

    function handlePointerMove(event: MouseEvent | PointerEvent) {
      updatePointerPosition(event)
      if (frame) return
      frame = requestAnimationFrame(evaluate)
    }

    window.addEventListener('pointermove', handlePointerMove, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
      if (frame) cancelAnimationFrame(frame)
      clearCloseTimer()
    }
  }, [isOpen])

  return {
    isOpen,
    onOpenChange: handleOpenChange,
    triggerProps: {
      ref: triggerRef,
      onMouseEnter: handleHoverEnter,
      onMouseLeave: handleHoverLeave,
      onPointerEnter: handleHoverEnter,
      onPointerLeave: handleHoverLeave,
    },
    triggerButtonProps: {
      onMouseEnter: handleHoverEnter,
      onPointerEnter: handleHoverEnter,
    },
    popoverProps: {
      ref: popoverRef,
      onMouseEnter: handleHoverEnter,
      onMouseLeave: handleHoverLeave,
      onPointerEnter: handleHoverEnter,
      onPointerLeave: handleHoverLeave,
    },
  }
}

function NavIcon({ Icon }: { Icon: LucideIcon }) {
  return <Icon className="size-4 shrink-0" strokeWidth={2.2} />
}

function RolePill({ isAdmin, label, className = '' }: { isAdmin: boolean; label: string; className?: string }) {
  return (
    <Chip
      color={isAdmin ? 'accent' : 'default'}
      size="sm"
      variant="soft"
      className={`border ${isAdmin ? 'border-accent/20 bg-accent/10' : 'border-border bg-default'} font-semibold ${className}`}
    >
      {label}
    </Chip>
  )
}

function DropdownNavigationItem({
  item,
  active,
  onSelect,
  className = '',
}: {
  item: NavigationItem
  active: boolean
  onSelect: (href: string) => void
  className?: string
}) {
  const { Icon } = item

  return (
    <Dropdown.Item
      id={item.href}
      textValue={item.label}
      onAction={() => onSelect(item.href)}
      className={`${menuItemClass(active)} ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={iconTileClass(active)}>
          <Icon className="size-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.label}</span>
          {/* Hidden below `sm`: at real phone widths (~390px) the mobile
              menu's popover leaves too little room for this line and it
              truncates to an unreadable fragment ("Device authe…"). Desktop's
              three dropdowns only ever render at the `xl:` breakpoint and
              above, so this never hides their descriptions. */}
          <span className={`hidden truncate text-xs sm:block ${active ? 'text-accent/75' : 'text-muted group-hover:text-foreground/70 group-data-[hovered]:text-foreground/70'}`}>{item.description}</span>
        </span>
      </div>
    </Dropdown.Item>
  )
}

// Source of truth for management UI is the *team* role, not the global User.role.
const TEAM_ROLE_RANK: Record<TeamSummary['role'], number> = {
  auditor: 0,
  member: 1,
  manager: 2,
  admin: 3,
  owner: 4,
}

const ROLE_LABEL_KEYS: Record<TeamSummary['role'], string> = {
  owner: 'roleOwner',
  admin: 'roleAdmin',
  manager: 'roleManager',
  auditor: 'roleAuditor',
  member: 'roleMember',
}

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const tCommon = useTranslations('common')
  const { data: session } = useSession()
  const userEmail = session?.user?.email ?? ''
  const userName = (session?.user?.name ?? userEmail) || t('account')
  const initials = userEmail ? userEmail[0].toUpperCase() : 'LM'

  function resolveNavItem(def: NavigationItemDef): NavigationItem {
    return { href: def.href, label: t(def.labelKey), description: t(def.descriptionKey), Icon: def.Icon }
  }

  const primaryItems = primaryItemDefs.map(resolveNavItem)
  const locationItems = locationItemDefs.map(resolveNavItem)
  const adminItems = adminItemDefs.map(resolveNavItem)
  const securityItem = resolveNavItem(securityItemDef)
  const teamAccessItem = resolveNavItem(teamAccessItemDef)

  const isLocationActive = locationItems.some((item) => isRouteActive(pathname, item.href))
  const accountMenuItems = [securityItem, teamAccessItem]
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [teamsLoaded, setTeamsLoaded] = useState(false)
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null)
  const locationDropdown = useHoverDropdown('locations', openDropdown, setOpenDropdown)
  const accountDropdown = useHoverDropdown('account', openDropdown, setOpenDropdown)
  const menuDropdown = useHoverDropdown('menu', openDropdown, setOpenDropdown)
  const activeTeam = teams.find((team) => team.isActive) ?? null
  // Management affordances follow the team role (TeamMember.role): a self-signup
  // owner is the admin of their own workspace even though their global role is 'staff'.
  const teamRole = activeTeam?.role ?? null
  const roleLabel = tCommon(teamRole ? ROLE_LABEL_KEYS[teamRole] : 'roleMember')
  const isAdmin = teamRole ? TEAM_ROLE_RANK[teamRole] >= TEAM_ROLE_RANK.manager : false

  useEffect(() => {
    if (!session?.user) return

    let cancelled = false

    async function loadTeams() {
      try {
        const res = await fetch('/api/teams')
        const payload = await res.json()
        if (!res.ok) return
        if (!cancelled) {
          setTeams((payload.teams ?? []) as TeamSummary[])
        }
      } catch {
        if (!cancelled) setTeams([])
      } finally {
        if (!cancelled) setTeamsLoaded(true)
      }
    }

    void loadTeams()

    return () => {
      cancelled = true
    }
  }, [session?.user?.email])

  function navigateTo(href: string) {
    router.push(href)
  }

  function handleSignOut() {
    void signOut({ callbackUrl: '/login' })
  }

  async function switchTeam(teamId: string) {
    if (!teamId || teamId === activeTeam?.id) return

    setSwitchingTeamId(teamId)
    try {
      const res = await fetch('/api/teams/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload?.error ?? t('switchTeamFailed'))
      }

      setTeams((current) =>
        current.map((team) => ({ ...team, isActive: team.id === teamId })),
      )

      // router.refresh() only invalidates Server Component data — every page
      // in this app (Dashboard, My Logs, Admin Logs, Locations, Quests, ...)
      // is a 'use client' component that fetches its own data in a mount-only
      // useEffect, so refresh() was a silent no-op for all of it: the switch
      // "succeeded" (the DB write and the toast both happened) while the
      // screen kept showing the old team's data. A hard reload is what
      // components/settings/passkeys/PasskeyManager.tsx already does after a
      // comparable session-state change, and it's the only thing guaranteed
      // to re-mount every page's data fetch regardless of how each one is
      // written. The NextAuth session `update()` this replaced is redundant
      // here — requireTeamAccess/requireTeamPermission (lib/middleware/auth.ts)
      // always re-read User.activeTeamId fresh from the DB rather than
      // trusting the JWT, and a full reload re-fetches the session anyway.
      toast.success(t('switchedTeam'))
      window.location.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('switchTeamFailed')
      toast.error(message)
    } finally {
      setSwitchingTeamId(null)
    }
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/82 backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3 sm:px-6">
        <Link href="/dashboard" className="group flex min-w-0 shrink-0 items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-bold tracking-tight text-foreground">Kamnotheat</span>
            <span className="block truncate text-xs font-medium text-muted">{tCommon('tagline')}</span>
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
          <div className="flex items-center gap-1 rounded-full border border-border/80 bg-overlay/70 p-1 shadow-sm shadow-black/5">
            {primaryItems.map((item) => {
              const active = isRouteActive(pathname, item.href)

              return (
                <Link key={item.href} href={item.href} className={navigationClass(active)}>
                  <NavIcon Icon={item.Icon} />
                  {item.label}
                </Link>
              )
            })}

            {!teamsLoaded ? (
              <>
                <span aria-hidden="true" className="mx-1 h-5 w-px self-center rounded-full bg-border/70" />
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </>
            ) : isAdmin && (
              <>
                <span aria-hidden="true" className="mx-1 h-5 w-px self-center rounded-full bg-border/70" />
                <div {...locationDropdown.triggerProps}>
                  <Dropdown isOpen={locationDropdown.isOpen} onOpenChange={locationDropdown.onOpenChange}>
                    <Dropdown.Trigger {...locationDropdown.triggerButtonProps} className={`${navigationClass(isLocationActive)} pr-2`} aria-label={t('openLocationMenu')}>
                      <Building2 className="size-4 shrink-0" strokeWidth={2.2} />
                      {t('locations')}
                      <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[open]:rotate-180" strokeWidth={2.5} />
                    </Dropdown.Trigger>
                    {locationDropdown.isOpen && (
                      <Dropdown.Popover placement="bottom start" className="w-64 rounded-2xl border border-border/70 bg-overlay p-2 shadow-xl shadow-slate-900/10">
                        <div {...locationDropdown.popoverProps}>
                          <div className="px-3 pb-2 pt-1">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t('locations')}</p>
                          </div>
                          <Dropdown.Menu aria-label={t('locationMenuLabel')} className="space-y-1">
                            {locationItems.map((item) => (
                              <DropdownNavigationItem
                                key={item.href}
                                item={item}
                                active={isRouteActive(pathname, item.href)}
                                onSelect={navigateTo}
                              />
                            ))}
                          </Dropdown.Menu>
                        </div>
                      </Dropdown.Popover>
                    )}
                  </Dropdown>
                </div>

                {adminItems.map((item) => {
                  const active = isRouteActive(pathname, item.href)

                  return (
                    <Link key={item.href} href={item.href} className={navigationClass(active)}>
                      <NavIcon Icon={item.Icon} />
                      {item.label}
                    </Link>
                  )
                })}
              </>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Deliberately visible at every width, not hidden below `sm`: a
              second instance used to live inside the mobile hamburger menu's
              own open Popover, and nesting one react-aria overlay trigger
              inside another's already-open content was an unverified risk
              this environment's tooling couldn't confirm either way (no real
              narrow-viewport test available). One always-visible instance
              here removes the nesting question entirely instead of arguing
              it's probably fine. */}
          <LanguageSwitcher />
          <ThemeToggle />
          <div {...accountDropdown.triggerProps}>
            <Dropdown isOpen={accountDropdown.isOpen} onOpenChange={accountDropdown.onOpenChange}>
              <Dropdown.Trigger {...accountDropdown.triggerButtonProps} className="hidden h-11 items-center gap-2 rounded-full border border-border/80 bg-overlay/80 py-1 pl-1 pr-3 text-sm font-medium text-muted shadow-sm shadow-black/5 outline-none transition-all hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 data-[hovered]:bg-accent/10 data-[hovered]:text-accent sm:inline-flex [&_svg]:text-current" aria-label={t('openAccountMenu')}>
                <Avatar color="accent" size="sm" variant="soft" className="shadow-sm shadow-accent/20">
                  <Avatar.Fallback>{initials}</Avatar.Fallback>
                </Avatar>
                <span className="hidden max-w-[150px] truncate md:block">{userName}</span>
                <ChevronDown className="size-3.5 text-current opacity-70" strokeWidth={2.5} />
              </Dropdown.Trigger>
              {accountDropdown.isOpen && (
                <Dropdown.Popover placement="bottom end" className="w-72 rounded-2xl border border-border/70 bg-overlay p-2 shadow-xl shadow-slate-900/10">
                  <div {...accountDropdown.popoverProps}>
                    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-3">
                      <Avatar color="accent" size="md" variant="soft">
                        <Avatar.Fallback>{initials}</Avatar.Fallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
                          <RolePill isAdmin={isAdmin} label={roleLabel} className="shrink-0" />
                        </div>
                        <p className="truncate text-xs text-muted">{userEmail || t('signedIn')}</p>
                        {activeTeam && (
                          <p className="truncate text-xs text-accent/80">{t('team', { name: activeTeam.name })}</p>
                        )}
                      </div>
                    </div>
                    <Separator className="my-2 bg-border/70" />
                    <Dropdown.Menu aria-label={t('accountActionsLabel')} className="space-y-1">
                      {accountMenuItems.map((item) => (
                        <DropdownNavigationItem
                          key={item.href}
                          item={item}
                          active={isRouteActive(pathname, item.href)}
                          onSelect={navigateTo}
                        />
                      ))}
                      {/* A bare `cond && (...)` here evaluates to the boolean
                          `false` when teams.length <= 1, and a stray `false`
                          sitting in Dropdown.Menu's children silently breaks
                          react-aria's Collection for every item after it —
                          live-verified: Sign Out below vanished from the DOM
                          entirely whenever this evaluated to `false`, with no
                          console error. `[] : [...]` always yields an array,
                          which Collection handles correctly regardless of
                          length. */}
                      {teams.length > 1
                        ? [
                            <Dropdown.Section key="switch-team">
                              <Header className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-muted">{t('switchTeam')}</Header>
                              {teams.map((team) => (
                                <Dropdown.Item
                                  key={team.id}
                                  id={`team-${team.id}`}
                                  textValue={team.name}
                                  onAction={() => void switchTeam(team.id)}
                                  className="rounded-xl px-3 py-2 outline-none transition-colors hover:bg-accent/10 focus:bg-accent/10"
                                >
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate font-semibold text-foreground">{team.name}</span>
                                    {team.isActive ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                        {t('active')}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted">
                                        {switchingTeamId === team.id ? t('switching') : t('switch')}
                                      </span>
                                    )}
                                  </div>
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Section>,
                          ]
                        : []}
                      <Dropdown.Item
                        id="sign-out"
                        textValue={t('signOut')}
                        onAction={handleSignOut}
                        className="mt-1 rounded-xl border border-danger/30 px-3 py-2 text-danger outline-none transition-colors hover:bg-danger/10 focus:bg-danger/10 data-[hovered]:bg-danger/10"
                      >
                        <div className="flex items-center gap-2">
                          <LogOut className="size-4" strokeWidth={2.2} />
                          <span className="text-sm font-semibold">{t('signOut')}</span>
                        </div>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </div>
                </Dropdown.Popover>
              )}
            </Dropdown>
          </div>

          <div {...menuDropdown.triggerProps}>
            <Dropdown isOpen={menuDropdown.isOpen} onOpenChange={menuDropdown.onOpenChange}>
              <Dropdown.Trigger {...menuDropdown.triggerButtonProps} className="flex size-11 items-center justify-center rounded-full border border-border/80 bg-overlay/80 text-muted shadow-sm shadow-black/5 outline-none transition-all hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 data-[hovered]:bg-accent/10 data-[hovered]:text-accent xl:hidden [&_svg]:text-current" aria-label={t('openNavMenu')}>
                <Menu className="size-5" strokeWidth={2.4} />
              </Dropdown.Trigger>
              {menuDropdown.isOpen && (
                <Dropdown.Popover placement="bottom end" className="max-h-[calc(100vh-5.5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-border/70 bg-overlay p-2 shadow-xl shadow-slate-900/10">
                  <div {...menuDropdown.popoverProps}>
                    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{t('menu')}</p>
                        <p className="text-xs text-muted">{t('menuSubtitle')}</p>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 items-center gap-2">
                          <RolePill isAdmin={isAdmin} label={roleLabel} />
                        </div>
                      )}
                    </div>
                    <Dropdown.Menu aria-label={t('mobileNavLabel')} className="space-y-1">
                      <DropdownNavigationItem
                        item={securityItem}
                        active={isRouteActive(pathname, securityItem.href)}
                        onSelect={navigateTo}
                        className="sm:hidden"
                      />
                      <DropdownNavigationItem
                        item={teamAccessItem}
                        active={isRouteActive(pathname, teamAccessItem.href)}
                        onSelect={navigateTo}
                        className="sm:hidden"
                      />
                      {primaryItems.map((item) => (
                        <DropdownNavigationItem
                          key={item.href}
                          item={item}
                          active={isRouteActive(pathname, item.href)}
                          onSelect={navigateTo}
                        />
                      ))}
                      {isAdmin && (
                        <>
                          <Dropdown.Section>
                            <Header className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-muted">{t('locations')}</Header>
                            {locationItems.map((item) => (
                              <DropdownNavigationItem
                                key={item.href}
                                item={item}
                                active={isRouteActive(pathname, item.href)}
                                onSelect={navigateTo}
                              />
                            ))}
                          </Dropdown.Section>
                          {adminItems.map((item) => (
                            <DropdownNavigationItem
                              key={item.href}
                              item={item}
                              active={isRouteActive(pathname, item.href)}
                              onSelect={navigateTo}
                            />
                          ))}
                        </>
                      )}
                      <Dropdown.Item
                        id="mobile-account"
                        textValue={t('account')}
                        onAction={() => undefined}
                        className="group rounded-xl px-3 py-2 text-foreground outline-none hover:bg-accent/10 hover:text-accent focus:bg-accent/10 focus:text-accent data-[hovered]:bg-accent/10 data-[hovered]:text-accent sm:hidden [&_svg]:text-current"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-default/50 text-muted ring-1 ring-border/50 transition-colors group-hover:bg-accent/10 group-hover:text-accent group-hover:ring-accent/15 group-data-[hovered]:bg-accent/10 group-data-[hovered]:text-accent group-data-[hovered]:ring-accent/15">
                            <UserRound className="size-4" strokeWidth={2.2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{userName}</span>
                            <span className="mt-1 flex items-center gap-2">
                              <span className="truncate text-xs text-muted">{userEmail || t('signedIn')}</span>
                              <RolePill isAdmin={isAdmin} label={roleLabel} className="shrink-0" />
                            </span>
                            {activeTeam && (
                              <span className="block truncate text-xs text-accent/80">{t('team', { name: activeTeam.name })}</span>
                            )}
                          </span>
                        </div>
                      </Dropdown.Item>
                      <Dropdown.Item
                        id="mobile-sign-out"
                        textValue={t('signOut')}
                        onAction={handleSignOut}
                        className="rounded-xl px-3 py-2 text-danger outline-none transition-colors hover:bg-danger/10 focus:bg-danger/10"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                            <LogOut className="size-4" strokeWidth={2.2} />
                          </span>
                          <span className="text-sm font-semibold">{t('signOut')}</span>
                        </div>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </div>
                </Dropdown.Popover>
              )}
            </Dropdown>
          </div>
        </div>
      </div>
    </nav>
  )
}