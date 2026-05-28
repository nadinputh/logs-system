"use client"

import { Toast } from "@heroui/react"

const toast = Object.assign(
  (message: React.ReactNode, options?: Parameters<typeof Toast.toast>[1]) =>
    Toast.toast(message, options),
  Toast.toast,
  {
    error: Toast.toast.danger,
  }
)

function Toaster() {
  return <Toast.Provider placement="bottom end" />
}

export { Toaster, toast }
