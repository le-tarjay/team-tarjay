import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AUTH_SERVICE } from '../../tokens';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AUTH_SERVICE);
  private readonly router = inject(Router);

  readonly currentEmployee = this.authService.currentEmployee;

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
