// @flow
export default function qNameLocalPart(qname: string): string {
  const [nsAlias, local] = qname.split(':'); // eslint-disable-line no-unused-vars

  return local;
}
