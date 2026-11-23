export type Mergeable = { id?: string; key?: string; updated_at?: string; _dirty?: boolean };

export function mergeRecord<T extends Mergeable>(local: T | undefined, remote: T): T {
  if (!local) return { ...remote, _dirty: false };
  const localTime = local.updated_at ? Date.parse(local.updated_at) : 0;
  const remoteTime = remote.updated_at ? Date.parse(remote.updated_at) : 0;
  if (local._dirty && localTime > remoteTime) return local;
  if (remoteTime >= localTime) return { ...remote, _dirty: false };
  return local;
}

export function shouldClearDirty(sentUpdatedAt: string, currentUpdatedAt: string): boolean {
  return sentUpdatedAt === currentUpdatedAt;
}
