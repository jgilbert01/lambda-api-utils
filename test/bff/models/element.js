import {
  now, mapper, sortKeyTransform,
} from '../../../src';
import { ttl } from '../../../src/connectors/dynamodb';

export const DISCRIMINATOR = 'element';
export const ALIAS = 'elements';

export const EEM = {};

export const MAPPER = mapper({
  transform: { sk: sortKeyTransform },
  rename: {
    sk: 'id',
  },
});

class Model {
  constructor({
    connector,
    debug,
    claims = { username: 'system' },
    encryptor,
  } = {}) {
    this.claims = claims;
    this.debug = debug;
    this.connector = connector;
    this.encryptor = encryptor;
  }

  async save({ id, elementId }, element) {
    const timestamp = now();
    return this.connector.update(
      {
        pk: id,
        sk: `${ALIAS}|${elementId}`,
      },
      /* await this.encryptor.encrypt(EEM, */{
        timestamp,
        lastModifiedBy: this.claims.username,
        ...element,
        discriminator: DISCRIMINATOR,
        deleted: null,
        latched: null,
        ttl: ttl(timestamp, 66),
        awsregion: process.env.AWS_REGION,
      }/* ) */,
    );
  }

  delete({ id, elementId }) {
    const timestamp = now();
    return this.connector.update(
      {
        pk: id,
        sk: `${ALIAS}|${elementId}`,
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
