import { registerHooks } from 'node:module';

const adapter = new URL('../vendor/minimatch-compat/index.cjs', import.meta.url).href;
const legacyPlugin = /\/node_modules\/eslint-plugin-(?:react|jsx-a11y|import)\//;

// Only these legacy CommonJS callers need the old callable export. Modern
// consumers, including ESLint itself and Jest, load the official module directly.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'minimatch' && legacyPlugin.test(context.parentURL ?? '')) {
      return { url: adapter, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
