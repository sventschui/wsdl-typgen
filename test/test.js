// @flow
/* eslint-disable no-unused-vars, camelcase */

// assert Client is exposed
import type { Client, DefaultBinding_ICalculator } from './wsdl/calc/calc.wsdl';

const on: ((event: "request", callback: (xml: string, eid: string) => void) => void)
 | ((
     event: "message",
     callback: (message: string, eid: string) => void
 ) => void)
 | ((
     event: "soapError",
     callback: (error: Object, eid: string) => void
 ) => void)
 | ((
     event: "response",
     callback: (body: string, res: Object, eid: string) => void
 ) => void) = () => {};

// assert Client has correct shape
// eslint-disable-next-line no-unused-vars

const binding: DefaultBinding_ICalculator = {
  Add(
    input: {| a?: ?number, b?: ?number |} | {| _xml: string |},
    options ?: Object,
    extraHeaders ?: Object,
    callback: (
          err?: any,
          result: {| result?: ?number |},
          rawResponse: string,
          soapHeader: Object,
          rawRequest: string
      ) => void,
  ): void {},
  Subtract(
    input: {| a ?: ? number, b ?: ? number |} | {| _xml: string |},
    options ?: Object,
    extraHeaders ?: Object,
    callback: (
                  err?: any,
                  result: {| result?: ?number |},
                  rawResponse: string,
                  soapHeader: Object,
                  rawRequest: string
              ) => void,
  ): void {},
};

const client: Client = {
  CalculatorService: {
    ICalculator: binding,
  },
  ...binding,
  AddAsync(
    input: {| a ?: ? number, b ?: ? number |} | {| _xml: string |},
    options ?: Object,
    extraHeaders ?: Object,
  ): Promise<[{| result?: ?number |}, string, Object, string]> {
    return new Promise<[{| result?: ?number |}, string, Object, string]>(() => {});
  },
  SubtractAsync(
    input: {| a ?: ? number, b ?: ? number |} | {| _xml: string |},
    options ?: Object,
    extraHeaders ?: Object,
  ): Promise<[{| result?: ?number |}, string, Object, string]> {
    return new Promise<[{| result?: ?number |}, string, Object, string]>(() => {});
  },
  describe() {
    return {};
  },
  setSecurity(security: {
        addOptions?: ?(options: Object) => void,
        addHeaders?: ?(headers: Object) => void,
        toXML: () => string,
        postProcess?: ?(xml: string, envelopeKey: string) => string
    }) {
  },
  addSoapHeader(
    soapHeader: any,
    name?: string,
    namespace?: any,
    xmlns?: string,
  ) {
    return 1;
  },
  changeSoapHeader(
    index: number,
    soapHeader: any,
    name?: string,
    namespace?: string,
    xmlns?: string,
  ) {
  },
  clearSoapHeaders() {
  },
  getSoapHeaders() {
    return ['foo', 'bar'];
  },
  lastRequest: {},
  setEndpoint(endpoint: string) {
  },
  on,
};
