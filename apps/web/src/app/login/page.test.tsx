import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock('@/components/login/static-login-page', () => ({
  StaticLoginPage: () => <div>静态登录页</div>,
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { isAuthenticated: boolean }) => unknown) =>
      selector({
        isAuthenticated: false,
      }),
    {}
  ),
}));

describe('LoginPage', () => {
  it('在 persist 不可用时也能正常渲染登录页', () => {
    render(<LoginPage />);

    expect(screen.getByText('静态登录页')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
