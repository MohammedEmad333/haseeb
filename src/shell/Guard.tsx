/**
 * Route and action guards.
 *
 * The rule this enforces: a screen a user cannot open is not merely hidden
 * from the navigation, it is unreachable. Hiding a link is a courtesy;
 * refusing the route is the control.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '@/state/SessionProvider';
import { SCREENS } from './screens';
import type { Ability } from '@/domain/abilities';
import { Card, EmptyState } from '@/ui/primitives';

export function RequireAbility({
  ability,
  children,
}: {
  ability: Ability;
  children: ReactNode;
}) {
  const { can, account } = useSession();
  if (can(ability)) return <>{children}</>;

  // Send them somewhere they can actually be, rather than a dead end.
  const fallback = SCREENS.find((s) => can(s.requires));
  if (fallback) return <Navigate to={fallback.path} replace />;

  return (
    <Card panel>
      <EmptyState
        title="لا توجد صلاحيات لهذا الحساب"
        body={`حساب «${account?.name ?? ''}» لا يملك صلاحية فتح أي شاشة. راجع المدير لتعيين الصلاحيات.`}
      />
    </Card>
  );
}

/** Render children only when the ability is granted. */
export function Can({ ability, children }: { ability: Ability; children: ReactNode }) {
  const { can } = useSession();
  return can(ability) ? <>{children}</> : null;
}
