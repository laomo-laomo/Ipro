'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface CelebrationOverlayProps {
  open: boolean;
  title?: string;
  description?: string;
  onClose?: () => void;
}

export function CelebrationOverlay({
  open,
  title = '你的童话绘本完成了！',
  description = '现在可以开始阅读、生成插画，或者继续把它打磨成更完整的作品。',
  onClose,
}: CelebrationOverlayProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const timer = setTimeout(() => onClose(), 2600);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-[#1E1B2E]/24 backdrop-blur-[2px]"
        >
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: 18 }).map((_, index) => (
              <motion.span
                key={index}
                className="absolute h-3 w-3 rounded-full bg-gradient-to-br from-amber-300 via-white to-violet-300"
                initial={{
                  opacity: 0,
                  scale: 0.5,
                  x: 0,
                  y: 0,
                  left: '50%',
                  top: '50%',
                }}
                animate={{
                  opacity: [0, 1, 0.9, 0],
                  scale: [0.5, 1.2, 1, 0.8],
                  x: Math.cos((index / 18) * Math.PI * 2) * (120 + (index % 3) * 28),
                  y: Math.sin((index / 18) * Math.PI * 2) * (90 + (index % 4) * 22),
                }}
                transition={{ duration: 1.6, ease: 'easeOut' }}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative mx-4 w-full max-w-md rounded-[32px] border border-white/70 bg-[#fffaf4] p-7 text-center shadow-[0_30px_80px_-25px_rgba(76,29,149,0.55)]"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-amber-400 text-white shadow-magic">
              <Sparkles className="h-8 w-8" />
            </div>
            <h3 className="mt-5 text-2xl font-bold">{title}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
