// Permission catalogue. Modules are code so every check is type-checked;
// which role holds what is data (RolePermission / UserGrant rows).
// Default grants for the other modules arrive with step 3a (auth & roles).

export const ACTIONS = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"] as const;
export type PermAction = (typeof ACTIONS)[number];

export const SCOPES = ["OWN", "UNIT", "ALL"] as const;
export type PermScope = (typeof SCOPES)[number];

export const MODULES = {
  tasks: { label: "Tasks", sensitive: false },
  sops: { label: "SOP templates", sensitive: false },
} as const;
export type PermModule = keyof typeof MODULES;

export function isModule(key: string): key is PermModule {
  return key in MODULES;
}

export function widerScope(a: PermScope, b: PermScope): PermScope {
  return SCOPES.indexOf(a) >= SCOPES.indexOf(b) ? a : b;
}
