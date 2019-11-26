// @flow

export default function createRegisterImport(onImport: (relativePath: string) => void) {
  return function registerImport(importEl: any, options: any) {
    if (arguments.length !== 2) {
      throw new Error('Expected exactly two arguments');
    }

    if (!importEl.$$root.$$imports[importEl.$.namespace.value]) {
      importEl.$$root.$$imports[importEl.$.namespace.value] = `i${Object.keys(importEl.$$root.$$imports).length}`; // eslint-disable-line no-param-reassign, max-len
    } else {
      return '';
    }

    onImport(importEl.$.schemaLocation.value);

    const importPath = importEl.$.schemaLocation.value.startsWith('/')
            || importEl.$.schemaLocation.value.startsWith('./')
            || importEl.$.schemaLocation.value.startsWith('../')
      ? importEl.$.schemaLocation.value
      : `./${importEl.$.schemaLocation.value}`;

    return options.fn({
      importName: importEl.$$root.$$imports[importEl.$.namespace.value],
      importPath,
    });
  };
}
