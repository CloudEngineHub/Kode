export type InkInstanceLike = {
  pause?: () => void
  resume?: () => void
  suspendStdin?: () => void
  resumeStdin?: () => void
}

const instances = new WeakMap<NodeJS.WriteStream, unknown>()

export function setInkInstanceForStdout(
  stdout: NodeJS.WriteStream,
  instance: unknown,
): void {
  instances.set(stdout, instance)
}

export function getInkInstanceForStdout(
  stdout: NodeJS.WriteStream,
): InkInstanceLike | undefined {
  return instances.get(stdout) as InkInstanceLike | undefined
}
