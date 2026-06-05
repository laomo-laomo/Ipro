import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '认证 - Ipro',
  description: '登录或注册您的 Ipro 账号',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}