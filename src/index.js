#!/usr/bin/env node
// @flow
import path from 'path';
import { promises as fs } from 'fs';
import { Parser } from 'xml2js';
import camelcase from 'camelcase';
import commander from 'commander';
import globRaw from 'glob';
import { promisify } from 'util';
import chokidar from 'chokidar';
import prettier from 'prettier';
import Handlebars from 'handlebars/runtime';
import packageJson from '../package.json';
// eslint-disable-next-line no-unused-vars
import parseFlowTemplatesDoNotUse from './templates/flow';

const glob = promisify(globRaw);

const byQName = (ns, local) => el => el.$ns.uri === ns && el.$ns.local === local;

commander
  .version(packageJson.version)
  .command('generate <wsdl...>')
  .option('-w, --watch', 'Watch for changes')
  .action(async (wsdls: $ReadOnlyArray<string>, command: Object) => {
    const wsdlTpl = Handlebars.templates.wsdl;
    const schemaTpl = Handlebars.templates.schema;
    const inlineSchemaTpl = Handlebars.templates['schema-content'];
    Object.keys(Handlebars.templates).forEach((key) => {
      Handlebars.registerPartial(camelcase(key), Handlebars.templates[key]);
    });

    const parser = new Parser({
      explicitChildren: true,
      childkey: '$children',
      explicitCharkey: true,
      preserveChildrenOrder: true,
      xmlns: true,
      explicitRoot: false,
    });

    const processedFiles: Set<string> = new Set();
    const watchedFiles = new Set();

    await Promise.all(wsdls.map(async (wsdl: string) => {
      const matched = await glob(wsdl);

      await Promise.all(matched.map(async (matchedFile) => {
        const absPath = path.resolve(matchedFile);
        await processFile(absPath, 'wsdl');
      }));

      if (command.watch) {
        chokidar.watch(wsdl)
          .on('add', async (file) => {
            await processFile(file, 'wsdl', true);
          })
          .on('error', (e) => {
            throw new Error(`Watcher threw error ${e}`);
          });
      }
    }));

    function addWatch(file: string, type: 'wsdl' | 'schema') {
      if (!command.watch) {
        return;
      }

      if (watchedFiles.has(file)) {
        return;
      }

      watchedFiles.add(file);

      chokidar.watch(file)
        .on('change', async () => {
          await processFile(file, type, true);
        })
        .on('error', (e) => {
          throw new Error(`Watcher threw error ${e}`);
        });
    }

    function addRootAndParent(child, root, parent) {
      child.$$root = root;
      child.$$parent = parent;

      if (child.$children) {
        child.$children.forEach(subchild => addRootAndParent(subchild, root, child));
      }
    }

    async function processFile(file: string, type: 'wsdl' | 'schema', force?: boolean = false) {
      if (!force && processedFiles.has(file)) {
        return;
      }

      processedFiles.add(file);

      addWatch(file, type);

      parser.parseString(
        // eslint-disable-next-line no-await-in-loop
        await fs.readFile(file, { charset: 'utf8' }),
        // eslint-disable-next-line no-loop-func
        async (err, rn) => {
          rn.$children.forEach(child => addRootAndParent(child, rn, rn));
          rn.$$imports = {};

          let templateFn;
          let targetNamespaceAlias;

          if (type === 'wsdl') {
            if (rn.$ns.local !== 'definitions'
              || rn.$ns.uri !== 'http://schemas.xmlsoap.org/wsdl/') {
              throw new Error(`Expected schema as root node but got ${rn.$ns.uri}:${rn.$ns.local} in ${file}`);
            }

            templateFn = wsdlTpl;

            const targetNsDefinition = Object.keys(rn.$).find(nsDefinition => nsDefinition.startsWith('xmlns:') && rn.$[nsDefinition].value === rn.$.targetNamespace.value);

            if (!targetNsDefinition) {
              throw new Error(`Could not find xmlns definition for nsUri ${rn.$.targetNamespace.value}`);
            }
  
            targetNamespaceAlias = targetNsDefinition.split(':')[1];
          } else if (type === 'schema') {
            if (rn.$ns.local !== 'schema'
              || rn.$ns.uri !== 'http://www.w3.org/2001/XMLSchema') {
              throw new Error(`Expected schema as root node but got ${rn.$ns.uri}:${rn.$ns.local} in ${file}`);
            }

            templateFn = schemaTpl;
          } else {
            throw new Error(`Unknown file type ${type}`);
          }

          function localPartNoValidation(qname) {
            const [nsAlias, local] = qname.split(':'); // eslint-disable-line no-unused-vars

            return local;
          }

          function localPart(qname) {
            const [nsAlias, local] = qname.split(':');

            if (nsAlias !== targetNamespaceAlias) {
              throw new Error(`Tried to use local part of QName that is not inside targetNs (${targetNamespaceAlias}): ${qname}`);
            }

            return local;
          }

          function resolveNs(nsAlias, el) {
            if (el.$ && el.$[`xmlns:${nsAlias}`]) {
              return el.$[`xmlns:${nsAlias}`].value;
            }

            if (el.$$parent) {
              return resolveNs(nsAlias, el.$$parent);
            }

            throw new Error(`Could not resolve nsAlias ${nsAlias}`);
          }

          const aliasForNamespace = (rootNode) => Object.keys(rootNode.$)
            .filter(key => key.startsWith('xmlns:'))
            .reduce((accum, key) => {
              const [xmlns, alias] = key.split(':'); // eslint-disable-line no-unused-vars
              const namespace = rootNode.$[key].value;
              accum[namespace] = alias; // eslint-disable-line no-param-reassign
              return accum;
            }, {});

          const helpers = {
            localPart,
            localPartNoValidation,
            inlineSchema(definitionsElement) {
              if (!definitionsElement.$children) {
                throw new Error('Expected one child in wsdl:definitions but got none');
              }

              return definitionsElement.$children.reduce((accum, child) => {
                if (child.$ns.local !== 'schema'
                  || child.$ns.uri !== 'http://www.w3.org/2001/XMLSchema') {
                  throw new Error(`Expected an xs:schema child in wsdl:definitions but got ${definitionsElement.$children[0].$ns.uri}:${definitionsElement.$children[0].$ns.local} in ${file}`);
                }

                if (child.$.targetNamespace.value === child.$$root.$.targetNamespace) {
                  
                }

                return accum + '\n\n' + inlineSchemaTpl(child, { helpers });
              }, '')
            },
            ifAttributeOptional(attribute, options) {
              if (attribute && attribute.$ && attribute.$.use && attribute.$.use.value === 'optional') {
                return options.fn(this);
              }

              return '';
            },
            withInputOutputAndFaults(operation, options) {
              const input = operation.$children.find(byQName('http://schemas.xmlsoap.org/wsdl/', 'input'));
              const output = operation.$children.find(byQName('http://schemas.xmlsoap.org/wsdl/', 'output'));
              const faults = operation.$children.filter(byQName('http://schemas.xmlsoap.org/wsdl/', 'fault'));

              return options.fn({
                operation, input, output, faults,
              });
            },
            withPortType(port, options) {
              const [bindingNameNsAlias, bindingNameLocal] = port.$.binding.value.split(':');

              if (bindingNameNsAlias !== targetNamespaceAlias) {
                throw new Error('referring to bindings of imported WSDLs is not supported yet!');
              }

              const binding = port.$$root.$children.find(child => child.$ns.local === 'binding'
              && child.$ns.uri === 'http://schemas.xmlsoap.org/wsdl/'
              && child.$.name.value === bindingNameLocal);

              const [portTypeNameNsAlias, portTypeNameLocal] = binding.$.type.value.split(':');

              if (portTypeNameNsAlias !== targetNamespaceAlias) {
                throw new Error('referring to port types of imported WSDLs is not supported yet!');
              }

              const portType = port.$$root.$children.find(child => child.$ns.local === 'portType'
              && child.$ns.uri === 'http://schemas.xmlsoap.org/wsdl/'
              && child.$.name.value === portTypeNameLocal);

              return options.fn({ portType });
            },
            ifArray(attributes, dflt, options) {
              const maxOccurs = attributes && attributes.maxOccurs
                ? attributes.maxOccurs.value
                : dflt;

              if (maxOccurs === 'unbounded' || parseInt(maxOccurs, 10) > 1) {
                return options.fn(this);
              }

              return '';
            },
            hasChildOfType(children, nsUri, local, options) {
              if (children && children.some(byQName(nsUri, local))) {
                return options.fn(this);
              }

              return '';
            },
            eachOfType(children, nsUri, local, options) {
              if (!children) {
                return '';
              }

              if (!Array.isArray(children)) {
                throw new Error('children not an array...');
              }

              let returnValue = '';

              const filtered = children.filter(byQName(nsUri, local));

              filtered.forEach(((child, index) => {
                returnValue += options.fn(child, { data: { last: index === filtered.length - 1 } });
              }));

              return returnValue;
            },
            asComment(text) {
              return text && `// ${text.split('\n').join('\n// ')}`;
            },
            ifOptional(attributes, dflt, options) {
              if (attributes.nillable && attributes.nillable.value === true) {
                return true;
              }

              const minOccurs = attributes && attributes.minOccurs
                ? attributes.minOccurs.value
                : dflt;

              if (minOccurs === '0') {
                return options.fn(this);
              }

              return '';
            },
            registerImport(importEl, options) {
              if (arguments.length !== 2) {
                throw new Error('Expected exactly two arguments');
              }

              if (!importEl.$$root.$$imports[importEl.$.namespace.value]) {
                importEl.$$root.$$imports[importEl.$.namespace.value] = `i${Object.keys(importEl.$$root.$$imports).length}`;
              } else {
                console.warn(`Import for namespace ${importEl.$.namespace.value} already registered`);
                return '';
              }

              processFile(path.resolve(file, '..', importEl.$.schemaLocation.value), 'schema');

              const importPath = importEl.$.schemaLocation.value.startsWith('/')
                || importEl.$.schemaLocation.value.startsWith('./')
                || importEl.$.schemaLocation.value.startsWith('../')
                ? importEl.$.schemaLocation.value
                : `./${importEl.$.schemaLocation.value}`;

              return options.fn({ 
                importName: importEl.$$root.$$imports[importEl.$.namespace.value],
                importPath,
              });
            },
            hasAttributes(children, options) {
              if (children
              && children.some(child => child.$ns.uri === 'http://www.w3.org/2001/XMLSchema'
                && ['attribute', 'anyAttribute', 'attributeGroup'].indexOf(child.$ns.local) !== -1)) {
                return options.fn(this);
              }

              return '';
            },
            typeName(typeName, el, options) {
              const [nsAlias, local] = typeName.split(':');

              const nsUri = resolveNs(nsAlias, el);

              if (nsUri === 'http://www.w3.org/2001/XMLSchema') {
                switch (local) {
                  case 'string':
                  case 'base64Binary':
                    return 'string';
                  case 'long':
                  case 'int':
                  case 'decimal':
                    return 'number';
                  case 'boolean':
                    return 'boolean';
                  case 'date':
                  case 'dateTime':
                  case 'time':
                    return 'Date';
                  default:
                    throw new Error(`Unknown built-in ${local}`);
                }
              }

              // check for imported stuff
              // this must go before targetNs as this might overrule it
              if (el.$$root.$$imports[nsUri]) {
                return `${el.$$root.$$imports[nsUri]}.${local}`;
              }


              // check for targetNameSpace
              if (el.$$root.$.targetNamespace.value === nsUri) {
                return local;
              }

              throw new Error(`Can't build typename for ${typeName} ${nsUri} in ${file}`);
            },
          };

          await fs.writeFile(`${file}.js`, prettier.format(templateFn(rn, { helpers }), { ...(await prettier.resolveConfig(`${file}.js`)), parser: 'babel' }), { charset: 'utf8' });
        },
      );
    }
  });

// error on unknown commands
commander.on('command:*', () => {
  commander.outputHelp();
  process.exit(1);
});

commander.parse(process.argv);

// $FlowFixMe
if (commander.args.length === 0) {
  commander.outputHelp();
  process.exit(1);
}
