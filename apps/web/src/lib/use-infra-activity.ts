'use client';
import { useEffect, useRef } from 'react';
import { infraApi } from './infra-api';

export function useInfraActivity(screen: string, enabled: boolean) {
  const previous = useRef('');
  useEffect(() => {
    if (!enabled || previous.current === screen) return;
    previous.current = screen;
    void infraApi('/activity/navigation',{ method: 'POST',body: JSON.stringify({ screen }) }).catch(() => undefined);
  },[screen,enabled]);
}
