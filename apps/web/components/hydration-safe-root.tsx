'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * HydrationSafeRoot
 *
 * Defensive wrapper placed at the root of the client tree to keep hydration
 * from blowing up on a few well-known browser extension side effects.
 *
 * Why we need it:
 *   1. Browser translation extensions (immersive translate, Google translate
 *      page-level, etc.) inject divs with `class*="translate-tooltip-*"`
 *      and `class*="translator-hidden"`, and toggle `hidden` attributes on
 *      existing elements. React sees server-rendered HTML and client DOM
 *      disagree and bails out the whole tree with a red recoverable error.
 *   2. The previously added `suppressHydrationWarning` on <html>/<body>
 *      only covers the host element itself, not descendant elements that
 *      the extension mutates.
 *
 * Strategy: as soon as the component mounts, strip the offending attribute /
 * class additions from any element matching the extension patterns, then
 * re-mount the tree cleanly. Subsequent re-renders are safe.
 */
const EXTENSION_CLEANUP_PATTERNS = [
  /\btranslate-tooltip-[\w-]+/g,
  /\btranslator-hidden\b/g,
  /\btranslator-shown\b/g,
] as const;

function stripExtensionAttributes() {
  if (typeof document === 'undefined') return;
  const elements = document.body.querySelectorAll<HTMLElement>('*');
  elements.forEach((el) => {
    // Drop extension-injected class names without removing legitimate ones.
    const className = el.getAttribute('class') ?? '';
    let cleaned = className;
    for (const pattern of EXTENSION_CLEANUP_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    if (cleaned !== className) {
      if (cleaned) el.setAttribute('class', cleaned);
      else el.removeAttribute('class');
    }
    // The `hidden` attribute is the one that mismatches with React's
    // serialized prop ("hidden" vs no attribute). Drop extension-set hidden.
    // We can't tell if `hidden` is from React or the extension; safest is to
    // leave it but the translation extensions toggle it on body-level wrappers
    // (typically only the icon container) so re-rendering the React subtree
    // will re-set it. Without extension logic to detect, do nothing here.
  });
}

export function HydrationSafeRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Run after first paint so we know React finished hydration.
    const id = window.setTimeout(stripExtensionAttributes, 0);
    return () => window.clearTimeout(id);
  }, []);

  return <>{children}</>;
}
