/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import Promise from 'bluebird';

import { defaultDebugLogger } from '../log';

class Connector {
  constructor({
    debug,
    bucketName = process.env.BUCKET_NAME,
    timeout = Number(process.env.S3_TIMEOUT) || Number(process.env.TIMEOUT) || 1000,
  }) {
    this.debug = (msg) => debug('%j', msg);
    this.bucketName = bucketName || /* istanbul ignore next */ 'undefined';
    this.client = new S3Client({
      requestHandler: new NodeHttpHandler({
        requestTimeout: timeout,
        connectionTimeout: timeout,
      }),
      logger: defaultDebugLogger(debug),
    });
  }

  listObjects({
    last, limit, Bucket, Prefix, Delimiter,
  }) {
    const params = {
      Bucket: Bucket || this.bucketName,
      Prefix,
      Delimiter,
      MaxKeys: limit,
      ContinuationToken: last
        ? /* istanbul ignore next */ JSON.parse(Buffer.from(last, 'base64').toString())
        : undefined,
    };

    return this._sendCommand(new ListObjectsV2Command(params))
      .then((data) => ({
        last: data.IsTruncated
          ? /* istanbul ignore next */ Buffer.from(JSON.stringify(data.NextContinuationToken)).toString('base64')
          : undefined,
        data,
      }));
  }

  getSignedUrl(operation, Key, other = {}) {
    const params = {
      Bucket: this.bucketName,
      Key,
      ...other,
    };

    return Promise.resolve(getSignedUrl(this.client,
      operation === 'putObject'
        ? new PutObjectCommand(params)
        : new GetObjectCommand(params),
      other))
      .tap(this.debug)
      .tapCatch(this.debug);
  }

  listObjectVersions({
    last, limit, Bucket, Prefix,
  }) {
    const params = {
      Bucket: Bucket || this.bucketName,
      Prefix,
      MaxKeys: limit,
      ...(last
        ? /* istanbul ignore next */ JSON.parse(Buffer.from(last, 'base64').toString())
        : {}),
    };

    return this._sendCommand(new ListObjectVersionsCommand(params))
      .then((data) => ({
        last: data.IsTruncated
          ? /* istanbul ignore next */ Buffer.from(JSON.stringify({
            KeyMarker: data.NextKeyMarker,
            VersionIdMarker: data.NextVersionIdMarker,
          })).toString('base64')
          : undefined,
        data,
      }));
  }

  headObject({ Bucket, Key, VersionId }) {
    const params = {
      Bucket: Bucket || this.bucketName,
      Key,
      VersionId,
    };

    return this._sendCommand(new HeadObjectCommand(params));
  }

  deleteObject({ Bucket, Key, VersionId }) {
    const params = {
      Bucket: Bucket || this.bucketName,
      Key,
      VersionId,
    };

    return this._sendCommand(new DeleteObjectCommand(params));
  }

  _sendCommand(command) {
    return Promise.resolve(this.client.send(command))
      .tap(this.debug)
      .tapCatch(this.debug);
  }
}

export default Connector;
