import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Animation d'entrée commune (framer-motion) : à étaler sur un `motion.*`
 * (`<motion.div {...fadeUp(0.1)} />`). Remplace les copies locales des pages.
 */
export const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, type: 'spring' as const, stiffness: 80 },
});
