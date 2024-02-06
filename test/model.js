import {
  now, ttl, deletedFilter, aggregateMapper, mapper,
} from '../src';

// import * as Element from './element';

export const DISCRIMINATOR = 'thing';

export const EEM = {};

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
    encryption,
  } = {}) {
    this.debug = debug;
    this.connector = connector;
    this.claims = claims;
    this.encryption = encryption;
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
          .map((e) => MAPPER(e, { ...this.encryption }))),
      }));
  }

  get(id) {
    return this.connector.get(id)
      .then((data) => AGGREGATE_MAPPER(data, { ...this.encryption }));
  }

  save(id, input) {
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
        inputParams: this.encryption.encrypt(EEM, {
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
      //     inputParams: this.encryption.encrypt(Element.EEM, {
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
