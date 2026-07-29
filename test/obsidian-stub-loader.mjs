// Redirects imports of 'obsidian' to a runtime stub during tests.
//
// The obsidian npm package ships type declarations only (its package.json has
// "main": ""), so any module whose import chain reaches 'obsidian' cannot be
// loaded under node:test. This hook makes the bare specifier resolve to
// ./obsidian-stub.mjs instead. Registered via:
//   node --import tsx --import ./test/obsidian-stub-loader.mjs --test ...
import { registerHooks } from 'node:module';

const stubUrl = new URL('./obsidian-stub.mjs', import.meta.url).href;

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'obsidian') {
            return { url: stubUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    }
});
