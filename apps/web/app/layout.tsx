import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { NavBar } from '@/components/ui/nav-bar';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'Ipro - AI童话故事创作平台',
  description: '上传照片，AI生成专属童话故事和插画绘本',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background antialiased">
        <AuthProvider>
          <ToastProvider>
            <NavBar />
            <main className="pt-0">
              {children}
            </main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


