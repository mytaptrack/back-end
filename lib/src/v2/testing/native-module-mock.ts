import { createRequire } from 'module';

/**
 * Production code loads optional modules such as amqplib with a lazy require() so Lambda
 * bundles do not need them. vi.mock cannot see native require(), so this seeds the require
 * cache instead. `from` is the directory the module resolves from, because each workspace
 * package has its own node_modules. Call the returned function to restore the real module.
 */
export function mockNativeModule(id: string, exports: unknown, from: string) {
  const nativeRequire = createRequire(`${from}/`);
  const resolved = nativeRequire.resolve(id);
  const previous = nativeRequire.cache[resolved];
  nativeRequire.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as NodeJS.Module;
  return () => {
    if (previous) {
      nativeRequire.cache[resolved] = previous;
    } else {
      delete nativeRequire.cache[resolved];
    }
  };
}
