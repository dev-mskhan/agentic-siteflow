import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it } from 'vitest';
import { LandingPage } from '../pages/LandingPage';
import { store } from '../store';

describe('LandingPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('renders the SiteFlow AI heading', async () => {
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <LandingPage />
        </QueryClientProvider>
      </Provider>,
    );
    expect(screen.getByRole('heading', { name: /siteflow ai/i })).toBeInTheDocument();
  });

  it('shows the API as online when health checks pass', async () => {
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <LandingPage />
        </QueryClientProvider>
      </Provider>,
    );
    expect(await screen.findByText(/online/i)).toBeInTheDocument();
    expect(screen.getByText('projects')).toBeInTheDocument();
  });
});
