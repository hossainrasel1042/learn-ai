

import type { User } from '@/lib/types';
import type { AdminMember } from '@/lib/api/admin';

export type Role = 'user' | 'admin';

export function isAdmin(user: User | null | undefined): boolean {
    return user?.profile?.role === 'admin';
}

export function hasRole(user: User | null | undefined, role: Role): boolean {
    return user?.profile?.role === role;
}

export function canManageUsers(user: User | null | undefined): boolean {
    return isAdmin(user);
}

export function canDeleteUser(user: User | null | undefined): boolean {
    return isAdmin(user);
}

export function canUpdateUserRole(user: User | null | undefined): boolean {
    return isAdmin(user);
}

export function getRoleLabel(role: Role): string {
    const labels: Record<Role, string> = {
        user: 'User',
        admin: 'Admin',
    };
    return labels[role];
}


export function getRoleBadgeColor(role: Role): string {
    const colors: Record<Role, string> = {
        user: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    };
    return colors[role];
}






export function isAdminMember(me: AdminMember | null | undefined): me is AdminMember {
    return !!me && me.status === 'active';
}


export function canManageMembers(me: AdminMember | null | undefined): boolean {
    if (!isAdminMember(me)) return false;
    return me.role === 'admin';
}


export function canManageMemberActions(me: AdminMember | null | undefined): boolean {
    if (!isAdminMember(me)) return false;
    return (me.permissions || []).includes('can_manage_members');
}


export function canViewAudit(me: AdminMember | null | undefined): boolean {
    if (!isAdminMember(me)) return false;
    return (me.permissions || []).includes('can_view_audit');
}


export function canManageCourses(me: AdminMember | null | undefined): boolean {
    if (!isAdminMember(me)) return false;
    return (me.permissions || []).includes('can_manage_courses');
}


export function canManageTarget(
    me: AdminMember | null | undefined,
    target: AdminMember | null | undefined,
): boolean {
    if (!isAdminMember(me)) return false;
    if (!(me.permissions || []).includes('can_manage_members')) return false;

    if (target?.role === 'admin' && me.role !== 'admin') return false;
    return true;
}