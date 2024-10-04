import { z } from 'zod';
import {
  now, deletedFilter, aggregateMapper, mapper,
} from '../../../src';
import { ttl } from '../../../src/connectors/dynamodb';

// import * as Element from './element';

export const DISCRIMINATOR = 'thing';

export const EEM = {};

export const SCHEMA = {
  query: z.object({
    params: z.object({}).strict(),
    body: z.null(),
    query: z.object({
      name: z.string().min(1, { message: 'Name must be at least 1 character.' }),
    }),
  }),
  get: z.object({
    params: z.object({
      id: z.string().uuid({ message: 'Invalid UUID.' }),
    }),
    query: z.object({}).strict(),
    body: z.null(),
  }),
  save: z.object({
    params: z.object({
      id: z.string().uuid({ message: 'Invalid UUID.' }),
    }),
    query: z.object({}).strict(),
    body: z.object({
      name: z.string().min(1, { message: 'Name must be at least 1 character.' }),
      email: z.string().email({ message: 'Invalid email address.' }),
      phone: z.string(),
      active: z.boolean(),
      roles: z
        .array(z.object({}).catchall(z.any()))
        .nonempty({ message: 'A least 1 role is required.' }),
    }),
  }),
};

export const MAPPER = mapper();

const AGGREGATE_MAPPER = aggregateMapper({
  aggregate: DISCRIMINATOR,
  cardinality: {
    // [Element.ALIAS]: 999,
  },
  mappers: {
    [DISCRIMINATOR]: MAPPER,
    // [Element.DISCRIMINATOR]: Element.MAPPER,
  },
});

class Model {
  constructor({
    debug,
    connector,
    claims = { sub: 'system' },
    encryptor,
  } = {}) {
    this.debug = debug;
    this.connector = connector;
    this.claims = claims;
    this.encryptor = encryptor;
  }

  query({ last, limit /* more params here */ }) {
    return this.connector
      .query({
        index: 'gsi1',
        keyName: 'discriminator',
        keyValue: DISCRIMINATOR,
        last,
        limit,
      })
      .then(async (response) => ({
        ...response,
        data: await Promise.all(response.data
          .filter(deletedFilter)
          .map((e) => MAPPER(e, { ...this.encryptor }))),
      }));
  }

  get(id) {
    return this.connector.get(id)
      .then((data) => AGGREGATE_MAPPER(data, { ...this.encryptor }));
  }

  async save(id, input) {
    const { elements, ...thing } = input;
    const timestamp = now();
    const lastModifiedBy = this.claims.sub;
    const deleted = null;
    const latched = null;
    const _ttl = ttl(timestamp, 33);
    const awsregion = process.env.AWS_REGION;

    return this.connector.batchUpdate([
      {
        key: {
          pk: id,
          sk: DISCRIMINATOR,
        },
        inputParams: await this.encryptor.encrypt(EEM, {
          ...thing,
          discriminator: DISCRIMINATOR,
          timestamp,
          lastModifiedBy,
          deleted,
          latched,
          ttl: _ttl,
          awsregion,
        }),
      },
      // elements are optional
      // they can be added/updated here but not deleted
      // they must be deleted individually
      // ...(elements || []).map((d) => {
      //   const { id: elementId, ...element } = d;

      //   return {
      //     key: {
      //       pk: id.toString(),
      //       sk: `${Element.ALIAS}|${elementId}`,
      //     },
      //     inputParams: await this.encryptor.encrypt(Element.EEM, {
      //       lastModifiedBy,
      //       timestamp,
      //       ...element,
      //       discriminator: Element.DISCRIMINATOR,
      //       deleted,
      //       latched,
      //       ttl: _ttl,
      //       awsregion,
      //     }),
      //   };
      // }),
    ]);
  }

  delete(id) {
    const timestamp = now();
    return this.connector.update(
      {
        pk: id,
        sk: DISCRIMINATOR,
      },
      {
        discriminator: DISCRIMINATOR,
        deleted: true,
        lastModifiedBy: this.claims.username,
        latched: null,
        ttl: ttl(timestamp, 11),
        timestamp,
        awsregion: process.env.AWS_REGION,
      },
    );
  }
}

export default Model;
