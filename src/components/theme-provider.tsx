"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { MotionConfig } from "framer-motion"

// MotionConfig reducedMotion="user" : framer-motion désactive les animations de
// transformation (x, y, scale, rotate) pour les visiteurs qui demandent moins de mouvement.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </NextThemesProvider>
  )
}
