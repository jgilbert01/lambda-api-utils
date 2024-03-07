import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import debug from 'debug';

import { KmsConnector, MOCK_GEN_DK_RESPONSE, MOCK_DECRYPT_DK_RESPONSE } from 'aws-kms-ee';

import encryption from '../../src/encryption';

const EEM = { fields: ['f1'] };

describe('encryption.js', () => {
  beforeEach(() => {
    sinon.stub(KmsConnector.prototype, 'generateDataKey').resolves(MOCK_GEN_DK_RESPONSE);
    sinon.stub(KmsConnector.prototype, 'decryptDataKey').resolves(MOCK_DECRYPT_DK_RESPONSE);
  });
  afterEach(sinon.restore);

  it('should encrypt', async () => {
    const encryptor = encryption({
      ...process.env,
      AES: false,
      debug: debug('e'),
    });

    expect(await encryptor.encrypt(EEM, {
      pk: '1',
      sk: 'thing',
      data: 'thing0',
      f1: 'v1',
      f9: true,
    })).to.deep.equal({
      pk: '1',
      sk: 'thing',
      data: 'thing0',
      f1: 'InYxIg==',
      f9: true,
      eem: {
        masterKeyAlias: 'alias/aws-kms-ee',
        dataKeys: {
          'us-west-2': MOCK_GEN_DK_RESPONSE.CiphertextBlob.toString('base64'),
        },
        fields: [
          'f1',
        ],
      },
    });
  });

  it('should decrypt', async () => {
    const encryptor = encryption({
      ...process.env,
      AES: false,
      debug: debug('e'),
    });

    expect(await encryptor.decrypt({
      pk: '1',
      sk: 'thing',
      data: 'thing0',
      f1: 'InYxIg==',
      f9: true,
      eem: {
        masterKeyAlias: 'alias/aws-kms-ee',
        dataKeys: {
          'us-west-2': MOCK_GEN_DK_RESPONSE.CiphertextBlob.toString('base64'),
        },
        fields: [
          'f1',
        ],
      },
    })).to.deep.equal({
      pk: '1',
      sk: 'thing',
      data: 'thing0',
      f1: 'v1',
      f9: true,
    });
  });

  it('should not decrypt - no eem', async () => {
    const encryptor = encryption({
      ...process.env,
      AES: false,
      debug: debug('e'),
    });

    expect(await encryptor.decrypt({
      pk: '1',
      sk: 'thing',
      data: 'thing0',
      f1: 'v1',
      f9: true,
    })).to.deep.equal({
      pk: '1',
      sk: 'thing',
      data: 'thing0',
      f1: 'v1',
      f9: true,
    });
  });

  it('should not decrypt - no data', async () => {
    const encryptor = encryption({
      ...process.env,
      AES: false,
      debug: debug('e'),
    });

    expect(await encryptor.decrypt({
    })).to.deep.equal({
    });
  });
});
