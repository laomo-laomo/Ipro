'use client';

export default function GlobalError() {
  return (
    <html lang="zh-CN">
      <body>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#fff7ed', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
          <section style={{ width: '100%', maxWidth: 420, borderRadius: 24, background: 'rgba(255,255,255,0.88)', padding: 28, textAlign: 'center', boxShadow: '0 24px 70px -36px rgba(76,29,149,0.45)' }}>
            <p style={{ margin: 0, color: '#be123c', fontSize: 14, fontWeight: 700 }}>500</p>
            <h1 style={{ margin: '10px 0 0', color: '#1e1b2e', fontSize: 28, lineHeight: 1.2 }}>故事书暂时合不上</h1>
            <p style={{ margin: '14px 0 24px', color: '#6b7280', fontSize: 14, lineHeight: 1.8 }}>
              服务遇到了一点问题，可以返回首页重新进入。
            </p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: '#7c3aed', color: 'white', padding: '0 22px', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
              回到首页
            </a>
          </section>
        </main>
      </body>
    </html>
  );
}
