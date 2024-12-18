/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import Promise from 'bluebird';
import _ from 'highland';
import { merge, omit, pick } from 'lodash';

import { defaultDebugLogger } from '../log';

export const ttl = (start, days) => Math.floor(start / 1000) + (60 * 60 * 24 * days);

export const updateExpression = (Item) => {
  const keys = Object.keys(Item);

  const ExpressionAttributeNames = keys
    .filter((attrName) => Item[attrName] !== undefined)
    .map((attrName) => ({ [`#${attrName}`]: attrName }))
    .reduce(merge, {});

  const ExpressionAttributeValues = keys
    .filter((attrName) => Item[attrName] !== undefined && Item[attrName] !== null)
    .map((attrName) => ({ [`:${attrName}`]: Item[attrName] }))
    .reduce(merge, {});

  let UpdateExpression = `SET ${keys
    .filter((attrName) => Item[attrName] !== undefined && Item[attrName] !== null)
    .map((attrName) => `#${attrName} = :${attrName}`)
    .join(', ')}`;

  const UpdateExpressionRemove = keys
    .filter((attrName) => Item[attrName] === null)
    .map((attrName) => `#${attrName}`)
    .join(', ');

  if (UpdateExpressionRemove.length) {
    UpdateExpression = `${UpdateExpression} REMOVE ${UpdateExpressionRemove}`;
  }

  return {
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    UpdateExpression,
    ReturnValues: 'ALL_NEW',
  };
};

class Connector {
  constructor({
    debug,
    tableName,
    convertEmptyValues,
    removeUndefinedValues = true,
    timeout = Number(process.env.DYNAMODB_TIMEOUT) || Number(process.env.TIMEOUT) || 1000,
    additionalClientOpts = {},
  }) {
    this.debug = (msg) => debug('%j', msg);
    this.tableName = tableName || /* istanbul ignore next */ 'undefined';
    this.client = Connector.getClient(debug, convertEmptyValues, removeUndefinedValues, timeout, additionalClientOpts);
  }

  static clients;

  static getClient(debug, convertEmptyValues, removeUndefinedValues, timeout, additionalClientOpts) {
    const addlRequestHandlerOpts = pick(additionalClientOpts, ['requestHandler']);
    const addlClientOpts = omit(additionalClientOpts, ['requestHandler']);

    if (!this.clients) {
      const dynamoClient = new DynamoDBClient({
        requestHandler: new NodeHttpHandler({
          requestTimeout: timeout,
          connectionTimeout: timeout,
          ...addlRequestHandlerOpts,
        }),
        logger: defaultDebugLogger(debug),
        ...addlClientOpts,
      });
      this.clients = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: {
          convertEmptyValues,
          removeUndefinedValues,
        },
      });
    }
    return this.clients;
  }

  update(Key, inputParams) {
    const params = {
      TableName: this.tableName,
      Key,
      ...updateExpression(inputParams),
    };

    return this._sendCommand(new UpdateCommand(params))
      .tap(this.debug)
      .tapCatch(this.debug);
  }

  batchUpdate(batch) {
    return Promise.all(
      batch.map((req) => this.update(req.key, req.inputParams)),
    );
  }

  get(id, IndexName, pk, sk, skName) {
    const params = {
      TableName: this.tableName,
      IndexName,
      KeyConditionExpression: sk ? '#pk = :pk and #sk = :sk' : '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': pk || 'pk',
        ...(sk ? { '#sk': skName || 'sk' } : {}),
      },
      ExpressionAttributeValues: {
        ':pk': id,
        ...(sk ? { ':sk': sk } : {}),
      },
      ConsistentRead: !IndexName,
    };

    return this._sendCommand(new QueryCommand(params))
      .tap(this.debug)
      .tapCatch(this.debug)
      .then((data) => data.Items);
    // TODO assert data.LastEvaluatedKey
  }

  query({
    index, keyName, keyValue, rangeName, rangeBeginsWithValue,
    last, limit, ScanIndexForward,
    FilterExpression,
    ExpressionAttributeNames = {},
    ExpressionAttributeValues = {},
  }) {
    const queryIncludesRange = rangeName && rangeBeginsWithValue;
    const KeyConditionExpression = queryIncludesRange ? '#keyName = :keyName and begins_with(#rangeName, :rangeBeginsWithValue)' : '#keyName = :keyName';

    const params = {
      TableName: this.tableName,
      IndexName: index,
      Limit: limit || /* istanbul ignore next */ 25,
      KeyConditionExpression,
      ExpressionAttributeNames: {
        '#keyName': keyName,
        ...(queryIncludesRange ? { '#rangeName': rangeName } : {}),
        ...ExpressionAttributeNames,
      },
      ExpressionAttributeValues: {
        ':keyName': keyValue,
        ...(queryIncludesRange ? { ':rangeBeginsWithValue': rangeBeginsWithValue } : {}),
        ...ExpressionAttributeValues,
      },
      FilterExpression,
      ScanIndexForward,
    };

    let cursor = last ? JSON.parse(Buffer.from(last, 'base64').toString()) : undefined;
    let itemsCount = 0;
    let nextLast;

    return _((push, next) => {
      params.ExclusiveStartKey = cursor;
      return this._sendCommand(new QueryCommand(params))
        .tap(this.debug)
        .tapCatch(this.debug)
        .then((data) => {
          itemsCount += data.Items.length;
          if (data.LastEvaluatedKey && itemsCount < params.Limit) {
            cursor = data.LastEvaluatedKey;
          } else {
            nextLast = data.LastEvaluatedKey;
            cursor = undefined;
          }

          data.Items.forEach((obj) => {
            push(null, obj);
          });
        })
        .catch(/* istanbul ignore next */(err) => {
          push(err, null);
        })
        .finally(() => {
          if (cursor) {
            next();
          } else {
            push(null, _.nil);
          }
        });
    })
      .collect()
      .map((data) => ({
        last: nextLast
          ? Buffer.from(JSON.stringify(nextLast)).toString('base64')
          : undefined,
        data,
      }))
      .toPromise(Promise);
  }

  queryAll({
    index, keyName, keyValue, rangeName, rangeBeginsWithValue,
    ScanIndexForward, FilterExpression,
    ExpressionAttributeNames = {},
    ExpressionAttributeValues = {},
  }) {
    const queryIncludesRange = rangeName && rangeBeginsWithValue;
    const KeyConditionExpression = queryIncludesRange ? '#keyName = :keyName and begins_with(#rangeName, :rangeBeginsWithValue)' : '#keyName = :keyName';

    const params = {
      TableName: this.tableName,
      IndexName: index,
      KeyConditionExpression,
      ExpressionAttributeNames: {
        '#keyName': keyName,
        ...(queryIncludesRange ? { '#rangeName': rangeName } : {}),
        ...ExpressionAttributeNames,
      },
      ExpressionAttributeValues: {
        ':keyName': keyValue,
        ...(queryIncludesRange ? { ':rangeBeginsWithValue': rangeBeginsWithValue } : {}),
        ...ExpressionAttributeValues,
      },
      FilterExpression,
      ScanIndexForward,
    };

    let cursor;
    // let itemsCount = 0;

    return _((push, next) => {
      params.ExclusiveStartKey = cursor;
      return this._sendCommand(new QueryCommand(params))
        .tap(this.debug)
        .tapCatch(this.debug)
        .then((data) => {
          if (data.LastEvaluatedKey) {
            cursor = data.LastEvaluatedKey;
          } else {
            cursor = undefined;
          }

          data.Items.forEach((obj) => {
            push(null, obj);
          });
        })
        .catch(/* istanbul ignore next */(err) => {
          push(err, null);
        })
        .finally(() => {
          if (cursor) {
            next();
          } else {
            push(null, _.nil);
          }
        });
    })
      .collect()
      .map((data) => ({ data }))
      .toPromise(Promise);
  }

  _sendCommand(command) {
    return Promise.resolve(this.client.send(command))
      .tap(this.debug)
      .tapCatch(this.debug);
  }
}

export default Connector;
