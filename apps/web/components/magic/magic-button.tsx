import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MagicButtonProps extends ButtonProps {
  href?: string;
}

export function MagicButton({ href, className, children, ...props }: MagicButtonProps) {
  const classes = cn(
    'group relative overflow-hidden rounded-full border border-violet-400/30 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-400 text-white shadow-magic transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-20px_rgba(124,58,237,0.7)]',
    className
  );

  const content = (
    <Button {...props} className={classes}>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <Sparkles className="relative h-4 w-4" />
      <span className="relative">{children}</span>
    </Button>
  );

  if (href) {
    return (
      <Link href={href}>
        {content}
      </Link>
    );
  }

  return content;
}
