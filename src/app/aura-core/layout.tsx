// src/app/aura-core/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aura Core - DayFlow',
  description: 'Your personal focus and well-being dashboard.',
};

export default function AuraCoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The main RootLayout already handles html and body tags with fonts.
    // This layout is primarily for potential page-specific wrappers if needed in future.
    // For now, it just passes children through.
    // Global styles for Aura Core are handled within its page component.
    <>{children}</> 
  );
}
