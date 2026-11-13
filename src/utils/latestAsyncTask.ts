/** Serial commands plus a single replaceable preview. Commands supersede pending previews. */
export function createPreviewTaskQueue<T>(preview: (value: T) => Promise<unknown>) {
  interface Task { run: () => Promise<unknown>; done: (value: unknown) => void; fail: (error: unknown) => void }
  let active = false;
  let pending: Task | null = null;
  const commands: Task[] = [];
  const pump = () => {
    if (active) return;
    active = true;
    void Promise.resolve().then(async () => {
      while (commands.length || pending) {
        const task = commands.shift() ?? pending!;
        if (task === pending) pending = null;
        try { task.done(await task.run()); } catch (error) { task.fail(error); }
      }
      active = false;
    });
  };
  return {
    preview(value: T): Promise<void> {
      return new Promise((done, fail) => {
        pending?.done(undefined);
        pending = { run: () => preview(value), done: () => done(), fail };
        pump();
      });
    },
    command<R>(run: () => Promise<R>): Promise<R> {
      return new Promise((done, fail) => {
        pending?.done(undefined);
        pending = null;
        commands.push({ run, done: value => done(value as R), fail });
        pump();
      });
    },
  };
}
