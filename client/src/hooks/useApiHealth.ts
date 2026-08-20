import { useQuery } from '@tanstack/react-query';
import { healthApi } from '../api/client';

export function useApiHealth() {
  return useQuery({
    queryKey: ['api', 'health'],
    queryFn: healthApi.check,
    refetchInterval: 30_000,
  });
}

export function useApiReady() {
  return useQuery({
    queryKey: ['api', 'ready'],
    queryFn: healthApi.ready,
  });
}
