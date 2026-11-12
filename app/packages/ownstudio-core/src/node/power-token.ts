// SPDX-License-Identifier: LGPL-2.1-only
import { randomUUID } from 'crypto';

/** Short-lived, one-use capabilities issued only after OwnStudio's dialog. */
export class PowerTokenStore {
    protected readonly tokens = new Map<string, number>();

    constructor(protected readonly now: () => number = Date.now, protected readonly ttlMs = 60_000,
        protected readonly make: () => string = randomUUID) { }

    issue(): string {
        this.expire();
        const token = this.make();
        this.tokens.set(token, this.now() + this.ttlMs);
        return token;
    }

    consume(token: string | undefined): boolean {
        if (!token) {
            return false;
        }
        const expires = this.tokens.get(token);
        this.tokens.delete(token);
        return expires !== undefined && expires >= this.now();
    }

    clear(): void {
        this.tokens.clear();
    }

    protected expire(): void {
        const now = this.now();
        for (const [token, expires] of this.tokens) {
            if (expires < now) {
                this.tokens.delete(token);
            }
        }
    }
}
