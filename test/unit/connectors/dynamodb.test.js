import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import debug from 'debug';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import Connector, { updateExpression, ttl } from '../../../src/connectors/dynamodb';

describe('connectors/dynamodb.js', () => {
  let mockDdb;

  beforeEach(() => {
    mockDdb = mockClient(DynamoDBDocumentClient);
  });

  afterEach(() => {
    mockDdb.restore();
  });

  it('should update', async () => {
    const spy = sinon.spy((_) => ({}));
    mockDdb.on(UpdateCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .update({
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
      }, {
        name: 'thing0',
        timestamp: 1600051691001,
      });

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      Key: {
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
      },
      ExpressionAttributeNames: { '#name': 'name', '#timestamp': 'timestamp' },
      ExpressionAttributeValues: { ':name': 'thing0', ':timestamp': 1600051691001 },
      UpdateExpression: 'SET #name = :name, #timestamp = :timestamp',
      ReturnValues: 'ALL_NEW',
    });
    expect(data).to.deep.equal({});
  });

  it('should batch update', async () => {
    const spy = sinon.spy((_) => ({}));
    mockDdb.on(UpdateCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .batchUpdate([
        {
          key: {
            pk: '00000000-0000-0000-0000-000000000000',
            sk: 'thing',
          },
          inputParams: {
            name: 'thing0',
            timestamp: 1600051691001,
          },
        },
        {
          key: {
            pk: '00000000-0000-0000-0000-000000000001',
            sk: 'thing',
          },
          inputParams: {
            name: 'thing1',
            timestamp: 1600051691001,
          },
        },
      ]);

    expect(spy).to.have.been.calledTwice;
    expect(spy.firstCall).to.have.been.calledWith({
      TableName: 't1',
      Key: {
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
      },
      ExpressionAttributeNames: { '#name': 'name', '#timestamp': 'timestamp' },
      ExpressionAttributeValues: { ':name': 'thing0', ':timestamp': 1600051691001 },
      UpdateExpression: 'SET #name = :name, #timestamp = :timestamp',
      ReturnValues: 'ALL_NEW',
    });
    expect(spy.secondCall).to.have.been.calledWith({
      TableName: 't1',
      Key: {
        pk: '00000000-0000-0000-0000-000000000001',
        sk: 'thing',
      },
      ExpressionAttributeNames: { '#name': 'name', '#timestamp': 'timestamp' },
      ExpressionAttributeValues: { ':name': 'thing1', ':timestamp': 1600051691001 },
      UpdateExpression: 'SET #name = :name, #timestamp = :timestamp',
      ReturnValues: 'ALL_NEW',
    });
    expect(data).to.deep.equal([{}, {}]);
  });

  it('should delete', async () => {
    const spy = sinon.spy((_) => ({}));
    mockDdb.on(DeleteCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .delete({
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
      });

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      Key: {
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
      },
    });
    expect(data).to.deep.equal({});
  });

  it('should get by id', async () => {
    const spy = sinon.spy((_) => ({
      Items: [{
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
        name: 'thing0',
        timestamp: 1600051691001,
      }],
    }));
    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .get('00000000-0000-0000-0000-000000000000');

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: undefined,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': '00000000-0000-0000-0000-000000000000' },
      ConsistentRead: true,
    });
    expect(data).to.deep.equal([{
      pk: '00000000-0000-0000-0000-000000000000',
      sk: 'thing',
      name: 'thing0',
      timestamp: 1600051691001,
    }]);
  });

  it('should get by id - with range', async () => {
    const spy = sinon.spy((_) => ({
      Items: [{
        pk: '00000000-0000-0000-0000-000000000000',
        sk: 'thing',
        name: 'thing0',
        timestamp: 1600051691001,
      }],
    }));
    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .get('00000000-0000-0000-0000-000000000000', undefined, undefined, 'thing');

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: undefined,
      KeyConditionExpression: '#pk = :pk and #sk = :sk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': '00000000-0000-0000-0000-000000000000', ':sk': 'thing' },
      ConsistentRead: true,
    });
    expect(data).to.deep.equal([{
      pk: '00000000-0000-0000-0000-000000000000',
      sk: 'thing',
      name: 'thing0',
      timestamp: 1600051691001,
    }]);
  });

  it('should query - page 1', async () => {
    const spy = sinon.spy((_) => ({
      LastEvaluatedKey: { pk: '1', sk: 'thing' },
      Items: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }],
    }));

    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .query({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: 'thing',
        limit: 1,
      });

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: 'gsi1',
      Limit: 1,
      ExclusiveStartKey: undefined,
      KeyConditionExpression: '#keyName = :keyName',
      ExpressionAttributeNames: { '#keyName': 'discriminator' },
      ExpressionAttributeValues: { ':keyName': 'thing' },
      FilterExpression: undefined,
      ScanIndexForward: undefined,
    });
    expect(data).to.deep.equal({
      last: 'eyJwayI6IjEiLCJzayI6InRoaW5nIn0=',
      data: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }],
    });
  });

  it('should query - page 1 - below limit', async () => {
    const spy = sinon.spy((_) => ({
      LastEvaluatedKey: { pk: '1', sk: 'thing' },
      Items: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }],
    }));

    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .query({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: 'thing',
        limit: 2,
      });

    expect(spy).to.have.been.calledTwice;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: 'gsi1',
      Limit: 2,
      ExclusiveStartKey: { pk: '1', sk: 'thing' },
      KeyConditionExpression: '#keyName = :keyName',
      ExpressionAttributeNames: { '#keyName': 'discriminator' },
      ExpressionAttributeValues: { ':keyName': 'thing' },
      FilterExpression: undefined,
      ScanIndexForward: undefined,
    });
    expect(data).to.deep.equal({
      last: 'eyJwayI6IjEiLCJzayI6InRoaW5nIn0=',
      data: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }, {
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }],
    });
  });

  it('should query - with range', async () => {
    const spy = sinon.spy((_) => ({
      LastEvaluatedKey: { pk: '1', sk: 'thing' },
      Items: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }],
    }));

    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .query({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: 'thing',
        rangeName: 'pk',
        rangeBeginsWithValue: '1',
        limit: 1,
      });

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: 'gsi1',
      Limit: 1,
      ExclusiveStartKey: undefined,
      KeyConditionExpression: '#keyName = :keyName and begins_with(#rangeName, :rangeBeginsWithValue)',
      ExpressionAttributeNames: { '#keyName': 'discriminator', '#rangeName': 'pk' },
      ExpressionAttributeValues: { ':keyName': 'thing', ':rangeBeginsWithValue': '1' },
      FilterExpression: undefined,
      ScanIndexForward: undefined,
    });
    expect(data).to.deep.equal({
      last: 'eyJwayI6IjEiLCJzayI6InRoaW5nIn0=',
      data: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      }],
    });
  });

  it('should query - page 2', async () => {
    const spy = sinon.spy((_) => ({
      Items: [{
        pk: '2',
        sk: 'thing',
        name: 'thing2',
        timestamp: 1600051691001,
      }],
    }));

    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .query({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: 'thing',
        last: 'eyJwayI6IjEiLCJzayI6InRoaW5nIn0=',
        limit: 1,
      });

    expect(spy).to.have.been.calledOnce;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: 'gsi1',
      Limit: 1,
      ExclusiveStartKey: { pk: '1', sk: 'thing' },
      KeyConditionExpression: '#keyName = :keyName',
      ExpressionAttributeNames: { '#keyName': 'discriminator' },
      ExpressionAttributeValues: { ':keyName': 'thing' },
      FilterExpression: undefined,
      ScanIndexForward: undefined,
    });
    expect(data).to.deep.equal({
      last: undefined,
      data: [{
        pk: '2',
        sk: 'thing',
        name: 'thing2',
        timestamp: 1600051691001,
      }],
    });
  });

  it('should query all', async () => {
    const responses = [
      {
        LastEvaluatedKey: { pk: '1', sk: 'thing' },
        Items: [{
          pk: '1',
          sk: 'thing',
          name: 'thing1',
          timestamp: 1600051691001,
        }],
      },
      {
        Items: [{
          pk: '2',
          sk: 'thing',
          name: 'thing2',
          timestamp: 1600051691001,
        }],
      },
    ];

    const spy = sinon.spy((_) => responses.shift());

    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .queryAll({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: 'thing',
      });

    expect(spy).to.have.been.calledTwice;
    // expect(spy).to.have.been.calledWith({
    //   TableName: 't1',
    //   IndexName: 'gsi1',
    //   ExclusiveStartKey: undefined,
    //   KeyConditionExpression: '#keyName = :keyName',
    //   ExpressionAttributeNames: { '#keyName': 'discriminator' },
    //   ExpressionAttributeValues: { ':keyName': 'thing' },
    //   FilterExpression: undefined,
    //   ScanIndexForward: undefined,
    // });
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: 'gsi1',
      ExclusiveStartKey: { pk: '1', sk: 'thing' },
      KeyConditionExpression: '#keyName = :keyName',
      ExpressionAttributeNames: { '#keyName': 'discriminator' },
      ExpressionAttributeValues: { ':keyName': 'thing' },
      FilterExpression: undefined,
      ScanIndexForward: undefined,
    });
    expect(data).to.deep.equal({
      data: [{
        pk: '1',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      },
      {
        pk: '2',
        sk: 'thing',
        name: 'thing2',
        timestamp: 1600051691001,
      }],
    });
  });

  it('should query all - with range', async () => {
    const responses = [
      {
        LastEvaluatedKey: { pk: '1', sk: 'thing' },
        Items: [{
          pk: '11',
          sk: 'thing',
          name: 'thing1',
          timestamp: 1600051691001,
        }],
      },
      {
        Items: [{
          pk: '12',
          sk: 'thing',
          name: 'thing2',
          timestamp: 1600051691001,
        }],
      },
    ];

    const spy = sinon.spy((_) => responses.shift());

    mockDdb.on(QueryCommand).callsFake(spy);

    const data = await new Connector({ debug: debug('db'), tableName: 't1' })
      .queryAll({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: 'thing',
        rangeName: 'pk',
        rangeBeginsWithValue: '1',
      });
    expect(spy).to.have.been.calledTwice;
    expect(spy).to.have.been.calledWith({
      TableName: 't1',
      IndexName: 'gsi1',
      ExclusiveStartKey: { pk: '1', sk: 'thing' },
      KeyConditionExpression: '#keyName = :keyName and begins_with(#rangeName, :rangeBeginsWithValue)',
      ExpressionAttributeNames: { '#keyName': 'discriminator', '#rangeName': 'pk' },
      ExpressionAttributeValues: { ':keyName': 'thing', ':rangeBeginsWithValue': '1' },
      FilterExpression: undefined,
      ScanIndexForward: undefined,
    });
    expect(data).to.deep.equal({
      data: [{
        pk: '11',
        sk: 'thing',
        name: 'thing1',
        timestamp: 1600051691001,
      },
      {
        pk: '12',
        sk: 'thing',
        name: 'thing2',
        timestamp: 1600051691001,
      }],
    });
  });

  it('should calculate updateExpression', () => {
    expect(updateExpression({
      id: '2f8ac025-d9e3-48f9-ba80-56487ddf0b89',
      name: 'Thing One',
      description: 'This is thing one.',
      status: undefined,
      status2: null,
      discriminator: 'thing',
      latched: true,
      ttl: ttl(1540454400000, 30),
      timestamp: 1540454400000,
    })).to.deep.equal({
      ExpressionAttributeNames: {
        '#description': 'description',
        '#discriminator': 'discriminator',
        '#id': 'id',
        '#latched': 'latched',
        '#name': 'name',
        // '#status': 'status',
        '#status2': 'status2',
        '#timestamp': 'timestamp',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':description': 'This is thing one.',
        ':discriminator': 'thing',
        ':id': '2f8ac025-d9e3-48f9-ba80-56487ddf0b89',
        ':latched': true,
        ':name': 'Thing One',
        // ':status': undefined,
        // ':status2': null,
        ':timestamp': 1540454400000,
        ':ttl': 1543046400,
      },
      UpdateExpression: 'SET #id = :id, #name = :name, #description = :description, #discriminator = :discriminator, #latched = :latched, #ttl = :ttl, #timestamp = :timestamp REMOVE #status2',
      ReturnValues: 'ALL_NEW',
    });
  });
});
