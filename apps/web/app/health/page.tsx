'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api/client';

type SubStatus = 'ok' | 'failed' | 'not_configured' | 'not_tested';

interface SubReport {
  status: SubStatus;
  detail?: string;
  latencyMs?: number;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSec?: number;
  env?: string;
  subsystems: Record<string, SubReport>;
}

const SUB_ORDER = ['api', 'db', 'redis', 'apiz', 'storage', 'web'] as const;

function statusColor(s: SubStatus): { bg: string; label: string } {
  switch (s) {
    case 'ok':
      return { bg: '#16a34a', label: 'OK' };
    case 'not_configured':
    case 'not_tested':
      return { bg: '#ca8a04', label: s === 'not_configured' ? '未配置' : '未测' };
    case 'failed':
    default:
      return { bg: '#dc2626', label: '失败' };
  }
}

function overallColor(o: string): string {
  if (o === 'healthy') return '#16a34a';
  if (o === 'degraded') return '#ca8a04';
  return '#dc2626';
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
      const json = (await res.json()) as HealthResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: '32px 24px', maxWidth: 760, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>IPro 系统健康</h1>
      <p style={{ color: '#64748b', marginTop: 4 }}>
        实时反映 dev / 部署环境 6 个子系统状态 · 每 5 秒刷新
      </p>

      {loading && !data && (
        <div style={{ marginTop: 24, color: '#64748b' }}>正在检查…</div>
      )}

      {error && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
          }}
        >
          <strong>无法连接 API</strong>
          <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 13 }}>{error}</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            确认 API 已在 {API_BASE} 启动。
          </div>
          <button
            onClick={load}
            style={{
              marginTop: 12,
              padding: '6px 14px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      )}

      {data && (
        <>
          <div
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 8,
              border: `2px solid ${overallColor(data.status)}`,
              background: 'white',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: overallColor(data.status),
                }}
              />
              <span style={{ fontSize: 20, fontWeight: 600 }}>
                {data.status === 'healthy' && '全部正常'}
                {data.status === 'degraded' && '降级运行'}
                {data.status === 'unhealthy' && '异常'}
              </span>
              <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 13 }}>
                {data.env} · 运行 {data.uptimeSec}s
              </span>
            </div>
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 13, fontFamily: 'monospace' }}>
              {data.timestamp}
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            {SUB_ORDER.map((key) => {
              const sub = data.subsystems[key];
              if (!sub) return null;
              const c = statusColor(sub.status);
              return (
                <div
                  key={key}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: c.bg,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{key}</div>
                    {sub.detail && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {sub.detail}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: c.bg,
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {c.label}
                  </span>
                  {typeof sub.latencyMs === 'number' && (
                    <span style={{ fontSize: 12, color: '#64748b', minWidth: 50, textAlign: 'right' }}>
                      {sub.latencyMs}ms
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 24, color: '#94a3b8', fontSize: 12 }}>
            数据来源:{API_BASE}/api/health
          </div>
        </>
      )}
    </div>
  );
}