export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#fff7ed' }}>
      <section style={{ width: '100%', maxWidth: 420, borderRadius: 24, background: 'rgba(255,255,255,0.88)', padding: 28, textAlign: 'center', boxShadow: '0 24px 70px -36px rgba(76,29,149,0.45)' }}>
        <p style={{ margin: 0, color: '#6d28d9', fontSize: 14, fontWeight: 700 }}>404</p>
        <h1 style={{ margin: '10px 0 0', color: '#1e1b2e', fontSize: 28, lineHeight: 1.2 }}>这页故事还没有写好</h1>
        <p style={{ margin: '14px 0 24px', color: '#6b7280', fontSize: 14, lineHeight: 1.8 }}>
          链接可能已经失效，或这本童话暂时不在书架上。
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: '#7c3aed', color: 'white', padding: '0 22px', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          回到首页
        </a>
      </section>
    </main>
  );
}
