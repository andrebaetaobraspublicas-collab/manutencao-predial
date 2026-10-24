'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { VideoLessons } from '../../video-lessons';

export default function EmbeddedVideoLessons() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    apiFetch<{ enabled: boolean }>('/orcapro/access').then(access => {
      if (!access.enabled) throw new Error('O acesso ao OrçaPro não está disponível.');
      if (active) setReady(true);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as vídeo-aulas.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || !content.current || window.parent === window) return;
    const element = content.current;
    const resize = () => window.parent.postMessage({ type: 'orcapro-videos-height', height: Math.ceil(element.getBoundingClientRect().height) + 4 }, window.location.origin);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [ready]);
  return <main ref={content} style={{ padding: '8px 0', minWidth: 0 }} aria-label="Vídeos tutoriais">
    {error ? <div role="alert"><p>{error}</p><a href="/orcapro/video-aulas/" target="_top">Abrir biblioteca de vídeo-aulas</a></div> : ready ? <VideoLessons /> : <p role="status">Carregando vídeos tutoriais…</p>}
  </main>;
}
