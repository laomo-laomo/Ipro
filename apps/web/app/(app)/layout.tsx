import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IPro - 童话故事生成',
  description: 'AI驱动的个性化童话故事生成平台',
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}