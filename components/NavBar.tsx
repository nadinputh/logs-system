'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import { Avatar, Chip, Dropdown, Separator } from '@heroui/react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import type { LucideIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LogoTile } from '@/components/Logo'
import {
  Building2,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Fingerprint,
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

type DropdownKey = 'locations' | 'account' | 'menu'

type TeamSummary = {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'manager' | 'member' | 'auditor'
  isActive: boolean
}

const primaryItems: NavigationItem[] = [
  { href: '/dashboard', label: 'Dashboard', description: 'Overview and activity', Icon: Home },
  { href: '/logs', label: 'My Logs', description: 'Personal check-ins', Icon: ClipboardList },
]

const locationItems: NavigationItem[] = [
  { href: '/admin/buildings', label: 'Buildings', description: 'Campuses and sites', Icon: Building2 },
  { href: '/admin/floors', label: 'Floors', description: 'Levels and wings', Icon: Layers3 },
  { href: '/admin/rooms', label: 'Rooms', description: 'Rooms and check-in spots', Icon: DoorOpen },
]

const adminItems: NavigationItem[] = [
  { href: '/admin/quests', label: 'Quests', description: 'Quest cards and routes', Icon: Sparkles },
  { href: '/admin/logs', label: 'All Logs', description: 'Audit every check-in', Icon: ShieldCheck },
]

const passkeyItem: NavigationItem = {
  href: '/settings/passkeys',
  label: 'Passkeys',
  description: 'Device authentication',
  Icon: Fingerprint,
}

const teamAccessItem: NavigationItem = {
  href: '/settings/team',
  label: 'Team & Access',
  description: 'Switch team and manage members',
  Icon: Users,
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navigationClass(active: boolean) {
  return [
    'group inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent/30 [&_svg]:text-current',
    active
      ? 'bg-accent/10 text-accent ring-1 ring-accent/15'
      : 'text-muted-foreground hover:bg-accent/10 hover:text-accent hover:ring-1 hover:ring-accent/10 data-[hovered]:bg-accent/10 data-[hovered]:text-accent data-[hovered]:ring-1 data-[hovered]:ring-accent/10',
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
      : 'bg-default/50 text-muted-foreground ring-border/50 group-hover:bg-accent/10 group-hover:text-accent group-hover:ring-accent/15 group-data-[hovered]:bg-accent/10 group-data-[hovered]:text-accent group-data-[hovered]:ring-accent/15',
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
  const suppressHoverOpenRef = useRef(false)
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

    if (suppressHoverOpenRef.current) return

    open()
  }

  function handleHoverLeave(event: ReactMouseEvent | ReactPointerEvent) {
    updatePointerPosition(event)
    suppressHoverOpenRef.current = false
    closeSoon()
  }

  function handleOpenChange(openState: boolean) {
    clearCloseTimer()
    suppressHoverOpenRef.current = false
    setOpenDropdown((current) => {
      if (openState) return key
      return current === key ? null : current
    })
  }

  useEffect(() => {
    if (!isOpen) return undefined

    function handlePointerMove(event: MouseEvent | PointerEvent) {
      updatePointerPosition(event)

      if (isPointerInsideDropdown()) {
        clearCloseTimer()
      } else {
        closeSoon()
      }
    }

    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('mousemove', handlePointerMove, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('mousemove', handlePointerMove, true)
      clearCloseTimer()
    }
  }, [isOpen])

  useEffect(() => {
    function handleTriggerPointerDown(event: PointerEvent) {
      updatePointerPosition(event)

      if (!isPointInside(triggerRef.current, 0)) return

      event.preventDefault()
      event.stopPropagation()
      clearCloseTimer()
      triggerRef.current?.querySelector<HTMLButtonElement>('[data-slot="dropdown-trigger"]')?.focus()
      setOpenDropdown((current) => {
        if (current === key) {
          suppressHoverOpenRef.current = true
          return null
        }

        suppressHoverOpenRef.current = false
        return key
      })
    }

    window.addEventListener('pointerdown', handleTriggerPointerDown, true)

    return () => {
      window.removeEventListener('pointerdown', handleTriggerPointerDown, true)
      clearCloseTimer()
    }
  }, [])

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
          <span className={`block truncate text-xs ${active ? 'text-accent/75' : 'text-muted-foreground group-hover:text-foreground/70 group-data-[hovered]:text-foreground/70'}`}>{item.description}</span>
        </span>
      </div>
    </Dropdown.Item>
  )
}

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, update } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? 'staff'
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1)
  const isAdmin = userRole === 'admin'
  const userEmail = session?.user?.email ?? ''
  const userName = (session?.user?.name ?? userEmail) || 'Account'
  const initials = userEmail ? userEmail[0].toUpperCase() : 'LM'
  const isLocationActive = locationItems.some((item) => isRouteActive(pathname, item.href))
  const accountMenuItems = [passkeyItem, teamAccessItem]
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null)
  const locationDropdown = useHoverDropdown('locations', openDropdown, setOpenDropdown)
  const accountDropdown = useHoverDropdown('account', openDropdown, setOpenDropdown)
  const menuDropdown = useHoverDropdown('menu', openDropdown, setOpenDropdown)
  const mobileMenuItems = isAdmin
    ? [...primaryItems, ...locationItems, ...adminItems]
    : [...primaryItems]
  const activeTeam = teams.find((team) => team.isActive) ?? null

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
        throw new Error(payload?.error ?? 'Failed to switch team')
      }

      setTeams((current) =>
        current.map((team) => ({ ...team, isActive: team.id === teamId })),
      )

      try {
        await update?.({ activeTeamId: teamId } as any)
      } catch {
        // Keep UI responsive even if session token refresh fails.
      }

      router.refresh()
      toast.success('Switched active team')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to switch team'
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
            <span className="block truncate text-[11px] font-medium text-muted-foreground">Secure check-in logging</span>
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

            {isAdmin && (
              <>
                <span aria-hidden="true" className="mx-1 h-5 w-px self-center rounded-full bg-border/70" />
                <div {...locationDropdown.triggerProps}>
                  <Dropdown isOpen={locationDropdown.isOpen} onOpenChange={locationDropdown.onOpenChange}>
                    <Dropdown.Trigger {...locationDropdown.triggerButtonProps} className={`${navigationClass(isLocationActive)} pr-2`} aria-label="Open location management menu">
                      <Building2 className="size-4 shrink-0" strokeWidth={2.2} />
                      Locations
                      <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[open]:rotate-180" strokeWidth={2.5} />
                    </Dropdown.Trigger>
                    {locationDropdown.isOpen && (
                      <Dropdown.Popover placement="bottom start" className="w-64 rounded-2xl border border-border/70 bg-overlay p-2 shadow-xl shadow-slate-900/10">
                        <div {...locationDropdown.popoverProps}>
                          <div className="px-3 pb-2 pt-1">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Locations</p>
                          </div>
                          <Dropdown.Menu aria-label="Location management navigation" className="space-y-1">
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
          <ThemeToggle />
          <div {...accountDropdown.triggerProps}>
            <Dropdown isOpen={accountDropdown.isOpen} onOpenChange={accountDropdown.onOpenChange}>
              <Dropdown.Trigger {...accountDropdown.triggerButtonProps} className="hidden h-10 items-center gap-2 rounded-full border border-border/80 bg-overlay/80 py-1 pl-1 pr-3 text-sm font-medium text-muted-foreground shadow-sm shadow-black/5 outline-none transition-all hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 data-[hovered]:bg-accent/10 data-[hovered]:text-accent sm:inline-flex [&_svg]:text-current" aria-label="Open account menu">
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
                        <p className="truncate text-xs text-muted-foreground">{userEmail || 'Signed in'}</p>
                        {activeTeam && (
                          <p className="truncate text-[11px] text-accent/80">Team: {activeTeam.name}</p>
                        )}
                      </div>
                    </div>
                    <Separator className="my-2 bg-border/70" />
                    <Dropdown.Menu aria-label="Account actions" className="space-y-1">
                      {accountMenuItems.map((item) => (
                        <DropdownNavigationItem
                          key={item.href}
                          item={item}
                          active={isRouteActive(pathname, item.href)}
                          onSelect={navigateTo}
                        />
                      ))}
                      {teams.length > 1 && (
                        <>
                          <div className="px-3 pb-1 pt-2">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Switch Team</p>
                          </div>
                          {teams.map((team) => (
                            <Dropdown.Item
                              key={team.id}
                              id={`team-${team.id}`}
                              textValue={`Switch to ${team.name}`}
                              onAction={() => void switchTeam(team.id)}
                              className="rounded-xl px-3 py-2 outline-none transition-colors hover:bg-accent/10 focus:bg-accent/10"
                            >
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate font-semibold text-foreground">{team.name}</span>
                                {team.isActive ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    Active
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {switchingTeamId === team.id ? 'Switching...' : 'Switch'}
                                  </span>
                                )}
                              </div>
                            </Dropdown.Item>
                          ))}
                        </>
                      )}
                    </Dropdown.Menu>

                    <Separator className="my-2 bg-border/70" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSignOut}
                      className="w-full justify-start gap-2 border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
                    >
                      <LogOut className="size-4" strokeWidth={2.2} />
                      Sign out
                    </Button>
                  </div>
                </Dropdown.Popover>
              )}
            </Dropdown>
          </div>

          <div {...menuDropdown.triggerProps}>
            <Dropdown isOpen={menuDropdown.isOpen} onOpenChange={menuDropdown.onOpenChange}>
              <Dropdown.Trigger {...menuDropdown.triggerButtonProps} className="flex size-10 items-center justify-center rounded-full border border-border/80 bg-overlay/80 text-muted-foreground shadow-sm shadow-black/5 outline-none transition-all hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 data-[hovered]:bg-accent/10 data-[hovered]:text-accent xl:hidden [&_svg]:text-current" aria-label="Open navigation menu">
                <Menu className="size-5" strokeWidth={2.4} />
              </Dropdown.Trigger>
              {menuDropdown.isOpen && (
                <Dropdown.Popover placement="bottom end" className="max-h-[calc(100vh-5.5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-border/70 bg-overlay p-2 shadow-xl shadow-slate-900/10">
                  <div {...menuDropdown.popoverProps}>
                    <div className="flex items-center justify-between px-3 pb-2 pt-1">
                      <div>
                        <p className="text-sm font-bold text-foreground">Menu</p>
                        <p className="text-xs text-muted-foreground">Navigation and account</p>
                      </div>
                      {isAdmin && <RolePill isAdmin={isAdmin} label={roleLabel} />}
                    </div>
                    <Dropdown.Menu aria-label="Mobile navigation" className="space-y-1">
                      <DropdownNavigationItem
                        item={passkeyItem}
                        active={isRouteActive(pathname, passkeyItem.href)}
                        onSelect={navigateTo}
                        className="sm:hidden"
                      />
                      <DropdownNavigationItem
                        item={teamAccessItem}
                        active={isRouteActive(pathname, teamAccessItem.href)}
                        onSelect={navigateTo}
                        className="sm:hidden"
                      />
                      {mobileMenuItems.map((item) => (
                        <DropdownNavigationItem
                          key={item.href}
                          item={item}
                          active={isRouteActive(pathname, item.href)}
                          onSelect={navigateTo}
                        />
                      ))}
                      <Dropdown.Item
                        id="mobile-account"
                        textValue="Account"
                        onAction={() => undefined}
                        className="group rounded-xl px-3 py-2 text-foreground outline-none hover:bg-accent/10 hover:text-accent focus:bg-accent/10 focus:text-accent data-[hovered]:bg-accent/10 data-[hovered]:text-accent sm:hidden [&_svg]:text-current"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-default/50 text-muted-foreground ring-1 ring-border/50 transition-colors group-hover:bg-accent/10 group-hover:text-accent group-hover:ring-accent/15 group-data-[hovered]:bg-accent/10 group-data-[hovered]:text-accent group-data-[hovered]:ring-accent/15">
                            <UserRound className="size-4" strokeWidth={2.2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{userName}</span>
                            <span className="mt-1 flex items-center gap-2">
                              <span className="truncate text-xs text-muted-foreground">{userEmail || 'Signed in'}</span>
                              <RolePill isAdmin={isAdmin} label={roleLabel} className="shrink-0" />
                            </span>
                            {activeTeam && (
                              <span className="block truncate text-[11px] text-accent/80">Team: {activeTeam.name}</span>
                            )}
                          </span>
                        </div>
                      </Dropdown.Item>
                      <Dropdown.Item
                        id="mobile-sign-out"
                        textValue="Sign out"
                        onAction={handleSignOut}
                        className="rounded-xl px-3 py-2 text-danger outline-none transition-colors hover:bg-danger/10 focus:bg-danger/10"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                            <LogOut className="size-4" strokeWidth={2.2} />
                          </span>
                          <span className="text-sm font-semibold">Sign out</span>
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