import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-athena';

import debug from 'debug';
import Connector, { executeQuery, getQueryResult } from '../../../src/connectors/athena';

const RESULTS = {
  ResultSet: {
    Rows: [
      {
        Data: [{ VarCharValue: 'row1_value_1' }, { VarCharValue: 'row1_value_2' }],
      },
      {
        Data: [{ VarCharValue: 'row2_value_1' }, { VarCharValue: 'row2_value_2' }],
      },
    ],
    ResultSetMetadata: {
      ColumnInfo: [
        { Name: 'column_name_1', Type: 'varchar' },
        { Name: 'column_name_2', Type: 'integer' },
      ],
    },
  },
  UpdateCount: 0,
};

const FAKE_CTX_2K = {
  getRemainingTimeInMillis: () => 2000,
};

const FAKE_CTX_500 = {
  getRemainingTimeInMillis: () => 500,
};

describe.only('connectors/athena.js', () => {
  describe('connector', () => {
    let mockAthena;

    beforeEach(() => {
      mockAthena = mockClient(AthenaClient);
    });

    afterEach(() => {
      mockAthena.restore();
    });

    it('should reuse client per pipeline', () => {
      const client1 = Connector.getClient(debug('test'));
      const client2 = Connector.getClient(debug('test'));
      expect(client1).to.eq(client2);
    });

    it('should start query exec', async () => {
      const spy = sinon.spy((_) => ({
        QueryExecutionId: '12345',
      }));
      mockAthena.on(StartQueryExecutionCommand).callsFake(spy);

      const params = {
        QueryString: 'select * from thing',
      };

      const data = await new Connector({
        debug: debug('athena'),
      }).startQueryExecution(params);

      expect(spy).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(data).to.deep.equal({
        QueryExecutionId: '12345',
      });
    });

    it('should get query exec', async () => {
      const spy = sinon.spy((_) => ({
        QueryExecution: {
          Status: {
            State: 'RUNNING',
          },
        },
      }));
      mockAthena.on(GetQueryExecutionCommand).callsFake(spy);

      const data = await new Connector({
        debug: debug('athena'),
      }).getQueryExecution({
        QueryExecutionId: '12345',
      });
      expect(spy).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(data).to.deep.equal({
        QueryExecution: {
          Status: {
            State: 'RUNNING',
          },
        },
      });
    });

    it('should get query results', async () => {
      const spy = sinon.spy((_) => (RESULTS));
      mockAthena.on(GetQueryResultsCommand).callsFake(spy);

      const data = await new Connector({
        debug: debug('athena'),
      }).getQueryResults({
        QueryExecutionId: '12345',
      });
      expect(spy).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(data).to.deep.equal(RESULTS);
    });
  });

  describe('helpers', () => {
    beforeEach(() => {
      sinon.stub(console, 'error');
    });
    afterEach(() => {
      sinon.restore();
    });

    it('should execute an query - one poll, no pagination', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution').resolves({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      });
      const getStub = sinon.stub(Connector.prototype, 'getQueryResults').resolves(RESULTS);

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await executeQuery(connector, {
        QueryString: 'select * from thing',
      }, FAKE_CTX_2K);

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(pollStub).to.have.been.calledOnce;
      expect(pollStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(getStub).to.have.been.calledOnce;
      expect(getStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
        NextToken: undefined,
        MaxResults: 100,
      });

      expect(data).to.deep.equal({
        data: [
          {
            column_name_1: 'row1_value_1',
            column_name_2: 'row1_value_2',
          },
          {
            column_name_1: 'row2_value_1',
            column_name_2: 'row2_value_2',
          },
        ],
        queryExecutionId: '12345',
        last: undefined,
      });
    });

    it('should execute an query - two poll, no pagination', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution');

      pollStub.onFirstCall().resolves({
        QueryExecution: {
          Status: {
            State: 'RUNNING',
          },
        },
      });
      pollStub.onSecondCall().resolves({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      });
      const getStub = sinon.stub(Connector.prototype, 'getQueryResults').resolves({
        ResultSet: {
          Rows: [
            {
              Data: [{ VarCharValue: 'row1_value_1' }, { VarCharValue: 'row1_value_2' }],
            },
            {
              Data: [{ VarCharValue: 'row2_value_1' }, { VarCharValue: 'row2_value_2' }],
            },
          ],
          ResultSetMetadata: {
            ColumnInfo: [
              { Name: 'column_name_1', Type: 'varchar' },
              { Name: 'column_name_2', Type: 'integer' },
            ],
          },
        },
        UpdateCount: 0,
      });

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await executeQuery(connector, {
        QueryString: 'select * from thing',
        QueryExecutionContext: {
          Database: 's3tablescatalog/my-sys-lh-resources-gld-dev/subsys1',
        },
        ResultConfiguration: {
          OutputLocation: 's3://my-sys-lh-resources-gld-dev-us-west-2/subsys1/reports/somereport',
        },
        WorkGroup: 'sys-lh-subsys1-dev',
      }, FAKE_CTX_2K);

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
        QueryExecutionContext: {
          Database: 's3tablescatalog/my-sys-lh-resources-gld-dev/subsys1',
        },
        ResultConfiguration: {
          OutputLocation: 's3://my-sys-lh-resources-gld-dev-us-west-2/subsys1/reports/somereport',
        },
        WorkGroup: 'sys-lh-subsys1-dev',
      });
      expect(pollStub).to.have.been.calledTwice;
      expect(pollStub.firstCall).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(pollStub.secondCall).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(getStub).to.have.been.calledOnce;
      expect(getStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
        NextToken: undefined,
        MaxResults: 100,
      });
      expect(data).to.deep.equal({
        data: [
          {
            column_name_1: 'row1_value_1',
            column_name_2: 'row1_value_2',
          },
          {
            column_name_1: 'row2_value_1',
            column_name_2: 'row2_value_2',
          },
        ],
        queryExecutionId: '12345',
        last: undefined,
      });
    });

    it('should execute an query - two poll, no pagination - QUEUED', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution');

      pollStub.onFirstCall().resolves({
        QueryExecution: {
          Status: {
            State: 'QUEUED',
          },
        },
      });
      pollStub.onSecondCall().resolves({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      });
      const getStub = sinon.stub(Connector.prototype, 'getQueryResults').resolves({
        ResultSet: {
          Rows: [
            {
              Data: [{ VarCharValue: 'row1_value_1' }, { VarCharValue: 'row1_value_2' }],
            },
            {
              Data: [{ VarCharValue: 'row2_value_1' }, { VarCharValue: 'row2_value_2' }],
            },
          ],
          ResultSetMetadata: {
            ColumnInfo: [
              { Name: 'column_name_1', Type: 'varchar' },
              { Name: 'column_name_2', Type: 'integer' },
            ],
          },
        },
        UpdateCount: 0,
      });

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await executeQuery(connector, {
        QueryString: 'select * from thing',
      }, FAKE_CTX_2K);

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(pollStub).to.have.been.calledTwice;
      expect(pollStub.firstCall).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(pollStub.secondCall).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(getStub).to.have.been.calledOnce;
      expect(getStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
        NextToken: undefined,
        MaxResults: 100,
      });
      expect(data).to.deep.equal({
        data: [
          {
            column_name_1: 'row1_value_1',
            column_name_2: 'row1_value_2',
          },
          {
            column_name_1: 'row2_value_1',
            column_name_2: 'row2_value_2',
          },
        ],
        queryExecutionId: '12345',
        last: undefined,
      });
    });

    it('should execute an query - one poll, pagination', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution').resolves({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      });
      const getStub = sinon.stub(Connector.prototype, 'getQueryResults');
      getStub.onFirstCall().resolves({
        ResultSet: {
          Rows: [
            {
              Data: [{ VarCharValue: 'row1_value_1' }, { VarCharValue: 'row1_value_2' }],
            },
            {
              Data: [{ VarCharValue: 'row2_value_1' }, { VarCharValue: 'row2_value_2' }],
            },
          ],
          ResultSetMetadata: {
            ColumnInfo: [
              { Name: 'column_name_1', Type: 'varchar' },
              { Name: 'column_name_2', Type: 'integer' },
            ],
          },
        },
        NextToken: '12345',
        UpdateCount: 0,
      });

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await executeQuery(connector, {
        QueryString: 'select * from thing',
      }, FAKE_CTX_2K);

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(pollStub).to.have.been.calledOnce;
      expect(pollStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(getStub).to.have.been.calledOnce;
      expect(getStub.firstCall).to.have.been.calledWith({
        QueryExecutionId: '12345',
        NextToken: undefined,
        MaxResults: 100,
      });
      expect(data).to.deep.equal({
        data: [
          {
            column_name_1: 'row1_value_1',
            column_name_2: 'row1_value_2',
          },
          {
            column_name_1: 'row2_value_1',
            column_name_2: 'row2_value_2',
          },
        ],
        queryExecutionId: '12345',
        last: '12345',
      });
    });

    it('should execute an query - one poll, FAILED', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution').resolves({
        QueryExecution: {
          Status: {
            State: 'FAILED',
            StateChangeReason: 'BAD SYNTAX',
          },
        },
      });

      let failed = false;
      try {
        const connector = new Connector({
          debug: debug('athena'),
        });

        await executeQuery(connector, {
          QueryString: 'select * from thing',
        }, FAKE_CTX_2K);
      } catch (err) {
        expect(err.message).to.eq('Query FAILED: BAD SYNTAX');
        failed = true;
      }

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(pollStub).to.have.been.calledOnce;
      expect(pollStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(failed).to.be.true;
    });

    it('should execute an query - one poll, CANCELLED', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
        ResultConfiguration: { OutputLocation: undefined },
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution').resolves({
        QueryExecution: {
          Status: {
            State: 'CANCELLED',
            StateChangeReason: 'TOO MANY',
          },
        },
      });

      let failed = false;
      try {
        const connector = new Connector({
          debug: debug('athena'),
        });

        await executeQuery(connector, {
          QueryString: 'select * from thing',
        }, FAKE_CTX_2K);
      } catch (err) {
        expect(err.message).to.eq('Query CANCELLED: TOO MANY');
        failed = true;
      }

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(pollStub).to.have.been.calledOnce;
      expect(pollStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(failed).to.be.true;
    });

    it('should execute an query - one poll, timeout', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await executeQuery(connector, {
        QueryString: 'select * from thing',
      }, FAKE_CTX_500);

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(data).to.deep.equal({
        status: 'RUNNING',
        queryExecutionId: '12345',
      });
    });

    it('should get query result - one poll, no pagination', async () => {
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution').resolves({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      });
      const getStub = sinon.stub(Connector.prototype, 'getQueryResults').resolves({
        ResultSet: {
          Rows: [
            {
              Data: [{ VarCharValue: 'row1_value_1' }, { VarCharValue: 'row1_value_2' }],
            },
            {
              Data: [{ VarCharValue: 'row2_value_1' }, { VarCharValue: 'row2_value_2' }],
            },
          ],
          ResultSetMetadata: {
            ColumnInfo: [
              { Name: 'column_name_1', Type: 'varchar' },
              { Name: 'column_name_2', Type: 'integer' },
            ],
          },
        },
        UpdateCount: 0,
      });

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await getQueryResult(connector,
        '12345',
        FAKE_CTX_2K,
        undefined);

      expect(pollStub).to.have.been.calledOnce;
      expect(pollStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(getStub).to.have.been.calledOnce;
      expect(getStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
        NextToken: undefined,
        MaxResults: 100,
      });
      expect(data).to.deep.equal({
        data: [
          {
            column_name_1: 'row1_value_1',
            column_name_2: 'row1_value_2',
          },
          {
            column_name_1: 'row2_value_1',
            column_name_2: 'row2_value_2',
          },
        ],
        queryExecutionId: '12345',
        last: undefined,
      });
    });

    it('should execute an query result - one poll, timeout', async () => {
      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await getQueryResult(connector,
        '12345',
        FAKE_CTX_500,
        undefined);
      expect(data).to.deep.equal({
        status: 'RUNNING',
        queryExecutionId: '12345',
      });
    });

    it('should filter out header row', async () => {
      const startStub = sinon.stub(Connector.prototype, 'startQueryExecution').resolves({
        QueryExecutionId: '12345',
      });
      const pollStub = sinon.stub(Connector.prototype, 'getQueryExecution').resolves({
        QueryExecution: {
          Status: {
            State: 'SUCCEEDED',
          },
        },
      });
      const getStub = sinon.stub(Connector.prototype, 'getQueryResults').resolves({
        ResultSet: {
          Rows: [
            {
              Data: [{ VarCharValue: 'column_name_1' }, { VarCharValue: 'column_name_2' }],
            },
            {
              Data: [{ VarCharValue: 'row1_value_1' }, { VarCharValue: 'row1_value_2' }],
            },
            {
              Data: [{ VarCharValue: 'row2_value_1' }, { VarCharValue: 'row2_value_2' }],
            },
          ],
          ResultSetMetadata: {
            ColumnInfo: [
              { Name: 'column_name_1', Type: 'varchar' },
              { Name: 'column_name_2', Type: 'integer' },
            ],
          },
        },
        UpdateCount: 0,
      });

      const connector = new Connector({
        debug: debug('athena'),
      });

      const data = await executeQuery(connector, {
        QueryString: 'select * from thing',
      }, FAKE_CTX_2K);

      expect(startStub).to.have.been.calledOnce;
      expect(startStub).to.have.been.calledWith({
        QueryString: 'select * from thing',
      });
      expect(pollStub).to.have.been.calledOnce;
      expect(pollStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
      });
      expect(getStub).to.have.been.calledOnce;
      expect(getStub).to.have.been.calledWith({
        QueryExecutionId: '12345',
        NextToken: undefined,
        MaxResults: 100,
      });
      expect(data).to.deep.equal({
        data: [
          {
            column_name_1: 'row1_value_1',
            column_name_2: 'row1_value_2',
          },
          {
            column_name_1: 'row2_value_1',
            column_name_2: 'row2_value_2',
          },
        ],
        queryExecutionId: '12345',
        last: undefined,
      });
    });
  });
});
