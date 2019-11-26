// @flow

export default function asComment(text: ?string): ?string {
  return text && `// ${text.split('\n').join('\n// ')}`;
}
