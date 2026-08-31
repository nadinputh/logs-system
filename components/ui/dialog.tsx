"use client"

import * as React from "react"
import { Modal as HeroModal } from "@heroui/react"
import { XIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Context — shared open/close state between Dialog and its children
// ---------------------------------------------------------------------------

type DialogState = {
  open: boolean
  setOpen: (open: boolean) => void
  // Every dialog in this app renders a DialogTitle; wiring the dialog's
  // accessible name to it (instead of the literal string "Dialog") means a
  // screen reader announces "Guest Details" / "Manual checkout" / etc., not
  // the same generic word for every dialog in the product.
  titleId: string
}

type PressLikeEvent = {
  defaultPrevented?: boolean
}

type TriggerRenderElementProps = {
  onClick?: (event: React.MouseEvent) => void
  onPress?: (event: PressLikeEvent) => void
  children?: React.ReactNode
}

type DialogTriggerBridgeProps = {
  render: React.ReactElement<TriggerRenderElementProps>
  children?: React.ReactNode
  onClick?: (event: React.MouseEvent) => void
  onPress?: (event: PressLikeEvent) => void
} & Record<string, unknown>

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
  const titleId = React.useId()
  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange, titleId }}>
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
}: DialogTriggerBridgeProps) {
  const context = React.useContext(DialogContext)

  if (!context) return null

  const isNativeElement = typeof render.type === "string"

  return React.cloneElement(render, {
    ...props,
    onClick: (e: React.MouseEvent) => {
      props.onClick?.(e)
      render.props?.onClick?.(e)
      if (!e.defaultPrevented) {
        props.onPress?.(e)
        render.props?.onPress?.(e)
      }
      if (!e.defaultPrevented) context.setOpen(true)
    },
    ...(isNativeElement
      ? null
      : {
          onPress: (e: PressLikeEvent) => {
            props.onPress?.(e)
            render.props?.onPress?.(e)
            if (!e?.defaultPrevented) context.setOpen(true)
          },
        }),
    children,
  })
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
    >
      {showCloseButton && (
        <HeroModal.CloseTrigger
          aria-label="Close dialog"
          onPress={onClose}
        >
          <XIcon className="h-4 w-4" aria-hidden />
          <span className="sr-only">Close</span>
        </HeroModal.CloseTrigger>
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
  size = "sm",
}: {
  className?: string
  children?: React.ReactNode
  showCloseButton?: boolean
  size?: React.ComponentProps<typeof HeroModal.Container>["size"]
}) {
  const context = React.useContext(DialogContext)

  if (!context) return null
  if (!context.open) return null

  const onClose = () => context.setOpen(false)

  return (
    <HeroModal.Backdrop isOpen={context.open} onOpenChange={context.setOpen}>
      <HeroModal.Container placement="center" scroll="inside" size={size}>
        <HeroModal.Dialog
          aria-label="Dialog"
          aria-labelledby={context.titleId}
          className={className}
        >
          <DialogInnerContainer onClose={onClose} showCloseButton={showCloseButton}>
            {children}
          </DialogInnerContainer>
        </HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  )
}

function DialogHeader(props: React.ComponentProps<typeof HeroModal.Header>) {
  return <HeroModal.Header {...props} />
}

function DialogIcon(props: React.ComponentProps<typeof HeroModal.Icon>) {
  return <HeroModal.Icon {...props} />
}

function DialogTitle({ id, ...props }: React.ComponentProps<typeof HeroModal.Heading>) {
  const context = React.useContext(DialogContext)
  return <HeroModal.Heading id={id ?? context?.titleId} {...props} />
}

function DialogBody(props: React.ComponentProps<typeof HeroModal.Body>) {
  return <HeroModal.Body {...props} />
}

function DialogFooter(props: React.ComponentProps<typeof HeroModal.Footer>) {
  return <HeroModal.Footer {...props} />
}

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogIcon,
  DialogTitle,
  DialogTrigger,
}
