import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { AuthService } from './core/auth/auth.service';
import { AUTH_SERVICE } from './core/tokens';
import { MockAuthService } from './mocks/mock-auth.service';

describe('appConfig', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers],
    });
  });

  it('resolves AUTH_SERVICE to the real AuthService', () => {
    const authService = TestBed.inject(AUTH_SERVICE);

    expect(authService).toBeInstanceOf(AuthService);
  });

  it('does not wire MockAuthService into the running app', () => {
    const authService = TestBed.inject(AUTH_SERVICE);

    expect(authService).not.toBeInstanceOf(MockAuthService);
  });

  it('resolves AUTH_SERVICE to the same instance as the root AuthService', () => {
    expect(TestBed.inject(AUTH_SERVICE)).toBe(TestBed.inject(AuthService));
  });
});
