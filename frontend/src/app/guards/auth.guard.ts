import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/portal']);
  return false;
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.currentUser()?.is_admin) {
    return true;
  }

  router.navigate(['/portal']);
  return false;
};

/** Exige el permiso de módulo indicado en `data.perm` (string o lista, basta uno). */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const required = route.data?.['perm'] as string | string[] | undefined;
  const perms = Array.isArray(required) ? required : required ? [required] : [];

  if (auth.isAuthenticated() && (perms.length === 0 || auth.can(...perms))) {
    return true;
  }

  router.navigate(['/portal']);
  return false;
};
