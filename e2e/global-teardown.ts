import { exec } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Stops the stack the suite started.
 *
 * Why this exists rather than leaving it to `webServer.gracefulShutdown`:
 * Playwright stops a `webServer` by signalling the process it spawned, and on
 * POSIX `docker compose up` catches SIGTERM and stops its containers on the
 * way out. **On Windows that does not happen.** Node cannot deliver a graceful
 * POSIX signal there, so the `docker compose` CLI is terminated outright — and
 * the containers, which live in the daemon rather than under that process,
 * carry on running. Observed on 2026-09-17: all three were still up after a
 * green run.
 *
 * So the config keeps `gracefulShutdown` as best-effort for POSIX, and this
 * file is what actually guarantees the outcome, on any platform, by running
 * the teardown command itself.
 *
 * The guard mirrors `webServer.reuseExistingServer`, and the split is
 * deliberate rather than a compromise:
 *
 * - **On CI** Playwright always starts the stack, so tearing it down is always
 *   correct. Doing it here rather than through a signal is what makes that
 *   deterministic on a runner of any platform.
 * - **Locally** the stack is left up on purpose. `reuseExistingServer` is true,
 *   so the next run reuses it and skips a rebuild — and tearing down here would
 *   also stop a stack a developer had started for their own work, which the
 *   suite has no business doing.
 */
const run = promisify(exec);

/** Where `docker-compose.yml` lives, relative to this folder. */
const STACK_DIR = '../infrastructure/local';

export default async function stopTheStack(): Promise<void> {
  if (!process.env.CI) {
    process.stdout.write(
      'Leaving the stack up: the next run reuses it, per `reuseExistingServer`. ' +
        `Stop it with \`docker compose down\` in \`${STACK_DIR}\`.\n`,
    );

    return;
  }

  try {
    await run('docker compose down', { cwd: STACK_DIR });
    process.stdout.write('Stack stopped.\n');
  } catch (error) {
    // Never fail the run from here. The specs have already reported, and a
    // teardown problem must not turn a green suite red or a red one confusing.
    // It is still worth saying loudly, because a runner that accumulates
    // containers will eventually fail for reasons that look unrelated.
    const reason = error instanceof Error ? error.message : String(error);

    process.stderr.write(
      `Could not stop the stack: ${reason}\n` +
        `Containers may still be running. Check with \`docker ps\`.\n`,
    );
  }
}
