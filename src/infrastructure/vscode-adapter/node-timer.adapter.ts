import type { TimerPort } from '../../application/ports/timer.port.js';

/**
 * Adapter: implements TimerPort using Node's setTimeout.
 * This is the only place in the codebase where setTimeout is allowed.
 */
export class NodeTimerAdapter implements TimerPort {
    sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
