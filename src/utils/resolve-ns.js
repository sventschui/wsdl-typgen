// @flow

export default function resolveNs(nsAlias: string, el: Object) {
  if (el.$ && el.$[`xmlns:${nsAlias}`]) {
    return el.$[`xmlns:${nsAlias}`].value;
  }

  if (el.$$parent) {
    return resolveNs(nsAlias, el.$$parent);
  }

  throw new Error(`Could not resolve nsAlias ${nsAlias}`);
}
