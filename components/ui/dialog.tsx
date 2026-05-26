"use client"

import * as React from "react"
import {
  Modal as HeroUIModal,
  ModalContent,
} from "@heroui/react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Context — shared open/close state between Dialog and its children
// ---------------------------------------------------------------------------

type DialogState = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogState | null>(null)

// Container used by portaled children (e.g. Select dropdowns) so they
// render inside the modal DOM tree and are not hidden by
// @react-aria/overlays' ariaHideOutside.
export const DialogPortalContainerContext =
  React.createContext<HTMLElement | null>(null)

// ---------------------------------------------------------------------------
// Dialog — state owner, no visual output
// ---------------------------------------------------------------------------

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange }}>
      {children}
    </DialogContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// DialogTrigger — opens the dialog via clone of the supplied render element
// ---------------------------------------------------------------------------

function DialogTrigger({
  render,
  children,
  ...props
}: {
  render: React.ReactElement
  children?: React.ReactNode
} & Record<string, any>) {
  const context = React.useContext(DialogContext)

  if (!context) return null

  return React.cloneElement(render, {
    ...props,
    onClick: (e: React.MouseEvent) => {
      props.onClick?.(e)
      render.props?.onClick?.(e)
      if (!e.defaultPrevented) context.setOpen(true)
    },
    onPress: (e: any) => {
      props.onPress?.(e)
      render.props?.onPress?.(e)
      if (!e?.defaultPrevented) context.setOpen(true)
    },
    children,
  })
}

// ---------------------------------------------------------------------------
// DialogClose — closes the dialog via clone of the supplied render element
// ---------------------------------------------------------------------------

function DialogClose({
  render,
  children,
  ...props
}: {
  render: React.ReactElement
  children?: React.ReactNode
} & Record<string, any>) {
  const context = React.useContext(DialogContext)

  if (!context) return null

  return React.cloneElement(render, {
    ...props,
    onClick: (e: React.MouseEvent) => {
      props.onClick?.(e)
      render.props?.onClick?.(e)
      if (!e.defaultPrevented) context.setOpen(false)
    },
    onPress: (e: any) => {
      props.onPress?.(e)
      render.props?.onPress?.(e)
      if (!e?.defaultPrevented) context.setOpen(false)
    },
    children,
  })
}

// Passthrough shims — keep the public API stable
function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

// ---------------------------------------------------------------------------
// DialogInnerContainer — owns the ref that Select portals attach to so the
// dropdown lives inside the modal's DOM tree.
// ---------------------------------------------------------------------------

function DialogInnerContainer({
  onClose,
  showCloseButton,
  children,
}: {
  onClose: () => void
  showCloseButton: boolean
  children?: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [container, setContainer] = React.useState<HTMLElement | null>(null)

  React.useEffect(() => {
    setContainer(ref.current)
  }, [])

  return (
    <div
      ref={ref}
      className="flex max-h-[calc(90dvh-3rem)] flex-col gap-4 overflow-y-auto p-5 sm:p-6"
    >
      {showCloseButton && (
        <button
          aria-label="Close dialog"
          onClick={onClose}
          type="button"
          className={cn(
            "absolute right-4 top-4 z-10",
            "rounded-lg p-1.5",
            "text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <XIcon className="h-4 w-4" aria-hidden />
          <span className="sr-only">Close</span>
        </button>
      )}
      <DialogPortalContainerContext.Provider value={container}>
        {children}
      </DialogPortalContainerContext.Provider>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DialogContent — HeroUI Modal used purely for backdrop + a11y + animation.
// All visual card styling lives here, not inside HeroUI's sub-components.
//
// className is merged onto the HeroUI "base" (the card element) so callers
// can override max-width / max-height just like they did with DialogPrimitive.
// ---------------------------------------------------------------------------

function DialogContent({
  className,
  children,
  showCloseButton = true,
}: {
  className?: string
  children?: React.ReactNode
  showCloseButton?: boolean
}) {
  const context = React.useContext(DialogContext)

  if (!context) return null

  return (
    <HeroUIModal
      isOpen={context.open}
      onOpenChange={context.setOpen}
      // Always centre (not bottom-sheet on mobile which is HeroUI's "auto")
      placement="center"
      // Use the HeroUI size system so the base slot is initialised, then our
      // classNames.base overrides override via tailwind-merge
      size="md"
      // Suppress HeroUI's own X button — we render our own below
      hideCloseButton
      // @base-ui/react Select portals its dropdown to <body>, which is outside
      // the HeroUI Modal DOM node. Without this callback, HeroUI's
      // @react-aria/overlays treats every click on the Select popup as an
      // "outside" click and dismisses the modal before the option registers.
      shouldCloseOnInteractOutside={(element) => {
        // Keep modal open while the user is interacting with any @base-ui
        // Select / Popup overlay (Positioner or Popup children).
        if (
          element.closest('[data-slot="select-content"]') ||
          element.closest('[role="listbox"]') ||
          element.closest('[role="option"]') ||
          // @base-ui renders scroll arrows and other helpers outside role attrs
          element.closest('[data-slot="select-scroll-up-button"]') ||
          element.closest('[data-slot="select-scroll-down-button"]')
        ) {
          return false
        }
        return true
      }}
      classNames={{
        // Wrapper: fill viewport, scroll vertically when content is tall
        wrapper: "overflow-y-auto items-center justify-center p-4 sm:p-6",
        // Card — our design tokens.
        // Reset HeroUI's sm:mx-6 sm:my-16 margins first, then apply ours.
        base: cn(
          // twMerge will pick the last winning class per property, so these
          // zero-margin classes override HeroUI's sm:mx-6 / sm:my-16.
          "mx-0 my-0 sm:mx-0 sm:my-0",
          // Visual card
          "relative w-full max-w-sm",
          "rounded-2xl bg-background text-foreground",
          "shadow-xl shadow-black/[0.07]",
          "border border-border/60",
          // Clip child content to rounded corners
          "overflow-hidden",
          // Caller can override width, height, etc.
          className
        ),
        // Soft backdrop
        backdrop: "bg-black/40 backdrop-blur-[2px]",
      }}
    >
      <ModalContent>
        {(onClose) => (
          <DialogInnerContainer
            onClose={onClose}
            showCloseButton={showCloseButton}
          >
            {children}
          </DialogInnerContainer>
        )}
      </ModalContent>
    </HeroUIModal>
  )
}

// ---------------------------------------------------------------------------
// Layout pieces — plain HTML, no HeroUI sub-components.
// Keeping these as divs/h2 avoids double-padding from ModalHeader etc.
// ---------------------------------------------------------------------------

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // pr-8 makes room for the absolute-positioned close button
      className={cn("flex flex-col gap-1.5 pr-8", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn(
        "text-base font-semibold leading-tight tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const context = React.useContext(DialogContext)

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Bleed to the edges of the padded inner container
        "-mx-5 sm:-mx-6 -mb-5 sm:-mb-6 mt-2",
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        "rounded-b-2xl border-t border-border/50 bg-muted/40",
        "px-5 sm:px-6 py-4",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && context && (
        <button
          type="button"
          onClick={() => context.setOpen(false)}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Close
        </button>
      )}
    </div>
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
