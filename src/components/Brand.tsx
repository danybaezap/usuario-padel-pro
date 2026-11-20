import { cx } from './ui';

const SRC = {
  compact: '/brand/padel-house.png', // icono + PADEL HOUSE
  full: '/brand/padel-house-full.png', // con "Powered by Finbra"
  icon: '/brand/padel-house-icon.png',
} as const;

/** Logo principal de Padel House (versión blanca con fondo transparente). */
export function BrandMark({ variant = 'full', className }: { variant?: keyof typeof SRC; className?: string }) {
  return (
    <img
      src={SRC[variant]}
      alt={variant === 'full' ? 'Padel House · Powered by Finbra' : 'Padel House'}
      className={cx('block w-auto select-none object-contain', 'h-10', className)}
      draggable={false}
    />
  );
}
