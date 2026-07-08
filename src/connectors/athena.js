/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-athena';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import Promise from 'bluebird';
import { omit, pick } from 'lodash';

import { defaultDebugLogger } from '../log';

class Connector {
  constructor({
    debug,
    timeout = Number(process.env.ATHENA_TIMEOUT) || Number(process.env.TIMEOUT) || 1000,
    additionalClientOpts = {},
  }) {
    this.debug = (msg) => debug('%j', msg);
    this.client = Connector.getClient(debug, timeout, additionalClientOpts);
  }

  static clients;

  static getClient(debug, timeout, additionalClientOpts) {
    const addlRequestHandlerOpts = pick(additionalClientOpts, ['requestHandler']);
    const addlClientOpts = omit(additionalClientOpts, ['requestHandler']);

    if (!this.clients) {
      this.clients = new AthenaClient({
        requestHandler: new NodeHttpHandler({
          requestTimeout: timeout,
          connectionTimeout: timeout,
          ...addlRequestHandlerOpts,
        }),
        logger: defaultDebugLogger(debug),
        ...addlClientOpts,
      });
    }
    return this.clients;
  }

  startQueryExecution(params) {
    return this._sendCommand(new StartQueryExecutionCommand(params));
  }

  getQueryExecution(params) {
    return this._sendCommand(new GetQueryExecutionCommand(params));
  }

  getQueryResults(params) {
    return this._sendCommand(new GetQueryResultsCommand(params));
  }

  _sendCommand(command) {
    return Promise.resolve(this.client.send(command))
      .tap(this.debug)
      .tapCatch(this.debug);
  }
}

export default Connector;

// helpers

export const executeQuery = async (connector, params, context, limit = 100) => {
  const { QueryExecutionId } = await connector.startQueryExecution(params);
  return getQueryResult(connector, QueryExecutionId, context, limit);
};

export const getQueryResult = async (connector, queryExecutionId, context, limit = 100, last) => {
  const status = await pollQueryResult(connector, queryExecutionId, context);
  if (status === 'SUCCEEDED') {
    return getResults(connector, queryExecutionId, limit, last);
  }
  return {
    status,
    queryExecutionId,
  };
};

export const pollQueryResult = async (connector, queryExecutionId, context) => {
  let status = 'RUNNING';
  while (context.getRemainingTimeInMillis() > 1000 && (status === 'RUNNING' || status === 'QUEUED')) {
    // eslint-disable-next-line no-await-in-loop
    const response = await connector.getQueryExecution({
      QueryExecutionId: queryExecutionId,
    });
    status = response.QueryExecution.Status.State;

    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(`Query ${status}: ${response.QueryExecution.Status.StateChangeReason}`);
    }
    if (status === 'SUCCEEDED') break;

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return status;
};

export const getResults = (connector, queryExecutionId, limit = 100, last) => connector.getQueryResults({
  QueryExecutionId: queryExecutionId,
  NextToken: last,
  MaxResults: limit,
})
  .then(async (response) => ({
    data: getFormattedResults(response.ResultSet),
    queryExecutionId,
    last: response.NextToken,
  }));

export const getFormattedResults = (resultSet) => {
  const columnNames = resultSet.ResultSetMetadata.ColumnInfo.map((col) => col.Name);

  const mappedResults = resultSet.Rows.map((row) => {
    const obj = {};
    row.Data.forEach((datum, index) => {
      if (datum.VarCharValue !== columnNames[index]) {
        obj[columnNames[index]] = datum.VarCharValue;
      }
    });
    return obj;
  });
  return mappedResults.filter((res) => Object.keys(res).length);
};
