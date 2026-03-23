/**
 * Custom Jest environment that works with Node 25+.
 *
 * Node 25 added localStorage as a native global whose getter throws unless
 * --localstorage-file is passed. jest-environment-node iterates nodeGlobals
 * and accesses globalThis[key] lazily, which triggers the SecurityError.
 *
 * This environment patches localStorage out of globalThis before the base
 * environment runs so the lazy getter is never triggered.
 */
'use strict';

// Neutralize the problematic localStorage getter before jest-environment-node
// sets up its lazy getter iteration.  We do this at require time so it runs
// before TestEnvironment's constructor.
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
if (descriptor && typeof descriptor.get === 'function') {
    // Replace the throwing getter with a simple undefined accessor so that
    // jest-environment-node's lazy getter can call globalThis['localStorage']
    // without throwing.
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() { return undefined; },
        set(v) {}
    });
}

const { TestEnvironment } = require('jest-environment-node');

class NodeCompatEnvironment extends TestEnvironment {
    constructor(config, context) {
        super(config, context);
        // Provide a no-op localStorage mock so tests that reference
        // global.localStorage don't crash.
        this.global.localStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
        };
    }
}

module.exports = NodeCompatEnvironment;
