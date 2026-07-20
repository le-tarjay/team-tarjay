import { Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Employee } from '../models/auth/employee.model';

export interface LoginCredentials {
  employeeId: string;
  pin: string;
}

export interface IAuthService {
  currentEmployee: Signal<Employee | null>;
  isAuthenticated: Signal<boolean>;

  login(credentials: LoginCredentials): Observable<Employee>;
  logout(): void;
}
