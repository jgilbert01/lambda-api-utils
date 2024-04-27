import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import debug from 'debug';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import * as s3RequestPresigner from '@aws-sdk/s3-request-presigner/dist-cjs/getSignedUrl';

import Connector from '../../../src/connectors/s3';

describe('connectors/s3.js', () => {
  let mockS3 = mockClient(S3Client);

  beforeEach(() => {
    mockS3 = mockClient(S3Client);
  });

  afterEach(() => {
    mockS3.restore();
    sinon.restore();
  });

  it('should get a signed url', async () => {
    // const spy = sinon.spy(() => 'https://123/456');
    // mockS3.on(PutObjectCommand).callsFake(spy);
    const spy = sinon.stub(s3RequestPresigner, 'getSignedUrl').resolves('https://123/456');

    const data = await new Connector({ debug: debug('s3') })
      .getSignedUrl('putObject', '1/2');
    expect(spy).to.have.been.calledOnce;
    // expect(spy).to.have.been.calledWith('putObject', {
    //   Bucket: 'b1',
    //   Key: '1/2',
    // });
    expect(data).to.equal('https://123/456');
  });

  it('should get a signed url for putObject', async () => {
    // const spy = sinon.spy(() => 'https://123/456');
    // mockS3.on(PutObjectCommand).callsFake(spy);
    const spy = sinon.stub(s3RequestPresigner, 'getSignedUrl').resolves('https://123/456');

    const data = await new Connector({ debug: debug('s3'), bucketName: 'b1' })
      .getSignedUrl('putObject', '1/2');

    expect(spy).to.have.been.calledOnce;
    // expect(spy).to.have.been.calledWith('putObject', {
    //   Bucket: 'b1',
    //   Key: '1/2',
    //   // ContentType: 'application/pdf',
    //   // ACL: 'private',
    // });
    expect(data).to.equal('https://123/456');
  });

  it('should get a signed url for getObject', async () => {
    // const spy = sinon.spy(() => 'https://123/456');
    // mockS3.on(GetObjectCommand).callsFake(spy);
    const spy = sinon.stub(s3RequestPresigner, 'getSignedUrl').resolves('https://123/456');

    const data = await new Connector({ debug: debug('s3'), bucketName: 'b1' })
      .getSignedUrl('getObject', '1/2');

    expect(spy).to.have.been.calledOnce;
    // expect(spy).to.have.been.calledWith('getObject', {
    //   Bucket: 'b1',
    //   Key: '1/2',
    // });
    expect(data).to.equal('https://123/456');
  });

  it('should get object head', async () => {
    const spy = sinon.spy(() => ({ Body: 'b' }));
    mockS3.on(HeadObjectCommand).callsFake(spy);

    const inputParams = {
      Key: 'k1',
    };

    const data = await new Connector({ debug: debug('s3'), bucketName: 'b1' })
      .headObject(inputParams);

    expect(spy).to.have.been.calledWith({
      Bucket: 'b1',
      Key: 'k1',
      VersionId: undefined,
    });
    expect(data).to.deep.equal({ Body: 'b' });
  });

  it('should list object versions', async () => {
    const spy = sinon.spy(() => [{ VersionId: 'v1' }]);
    mockS3.on(ListObjectVersionsCommand).callsFake(spy);

    const inputParams = {
      Prefix: 'k1',
      limit: 20,
    };

    const data = await new Connector({ debug: debug('s3'), bucketName: 'b1' })
      .listObjectVersions(inputParams);

    expect(spy).to.have.been.calledWith({
      Bucket: 'b1',
      Prefix: 'k1',
      MaxKeys: 20,
    });
    expect(data).to.deep.equal({
      last: undefined,
      data: [{ VersionId: 'v1' }],
    });
  });

  it('should list objects', async () => {
    const spy = sinon.spy(() => ({
      IsTruncated: false,
      NextContinuationToken: '',
      Contents: [
        {
          Key: 'p1/2021/03/26/19/1234',
          LastModified: '2021-03-26T19:17:15.000Z',
          ETag: '"a192b6e6886f117cd4fa64168f6ec378"',
          Size: 1271,
          StorageClass: 'STANDARD',
          Owner: {},
        },
      ],
      Name: 'b1',
      Prefix: 'p1',
      MaxKeys: 1000,
      CommonPrefixes: [],
    }));
    mockS3.on(ListObjectsV2Command).callsFake(spy);

    const inputParams = {
      Prefix: 'p1',
    };

    const data = await new Connector({ debug: debug('s3'), bucketName: 'b1' })
      .listObjects(inputParams);

    expect(spy).to.have.been.calledWith({
      Bucket: 'b1',
      Prefix: 'p1',
      Delimiter: undefined,
      MaxKeys: undefined,
      ContinuationToken: undefined,
    });

    expect(data).to.deep.equal({
      last: undefined,
      data: {
        IsTruncated: false,
        NextContinuationToken: '',
        Contents: [
          {
            Key: 'p1/2021/03/26/19/1234',
            LastModified: '2021-03-26T19:17:15.000Z',
            ETag: '"a192b6e6886f117cd4fa64168f6ec378"',
            Size: 1271,
            StorageClass: 'STANDARD',
            Owner: {},
          },
        ],
        Name: 'b1',
        Prefix: 'p1',
        MaxKeys: 1000,
        CommonPrefixes: [],
      },
    });
  });

  it('should delete object', async () => {
    const spy = sinon.spy(() => ({ DeleteMarker: false }));
    mockS3.on(DeleteObjectCommand).callsFake(spy);

    const inputParams = {
      Key: 'k1',
    };

    const data = await new Connector({ debug: debug('s3'), bucketName: 'b1' })
      .deleteObject(inputParams);

    expect(spy).to.have.been.calledWith({
      Bucket: 'b1',
      Key: 'k1',
      VersionId: undefined,
    });
    expect(data).to.deep.equal({ DeleteMarker: false });
  });
});
