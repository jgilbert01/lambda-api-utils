import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

import { validate } from '../../src/middleware';

import { SCHEMA } from '../bff/models/thing';

describe('validate.js', () => {
  afterEach(sinon.restore);

  it('should validate successfully', async () => {
    const req = {
      params: {
        id: 'ee71437e-4e3e-419f-9d11-5f636b1460e3',
      },
      query: {},
      body: {
        name: 'Fred',
        email: 'Fred@example.com',
        phone: '',
        active: true,
        roles: [{ name: 'User' }],
      },
    };
    const resp = {
    };
    const next = sinon.spy();

    await validate(SCHEMA.save)(req, resp, next);

    expect(next).to.have.been.called;
  });

  it('should validate to return errors', async () => {
    const req = {
      params: {
        id: '1',
      },
      query: {
        name: 'Fre',
      },
      body: {
        name: '',
        email: 'Fred',
        phone: '',
        active: undefined,
        roles: ['User'],
      },
    };
    const resp = {
      error: sinon.spy((data) => data),
    };
    const next = sinon.spy();

    await validate(SCHEMA.save)(req, resp, next);

    expect(next).to.have.not.been.called;
    expect(resp.error).to.have.been.calledWith(400, {
      errors: [
        {
          validation: 'uuid',
          code: 'invalid_string',
          message: 'Invalid UUID.',
          path: ['params', 'id'],
        },
        {
          code: 'unrecognized_keys',
          keys: [
            'name',
          ],
          path: [
            'query',
          ],
          message: "Unrecognized key(s) in object: 'name'",
        },
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          message: 'Name must be at least 1 character.',
          path: ['body', 'name'],
        },
        {
          validation: 'email',
          code: 'invalid_string',
          message: 'Invalid email address.',
          path: ['body', 'email'],
        },
        {
          code: 'invalid_type',
          expected: 'boolean',
          received: 'undefined',
          path: ['body', 'active'],
          message: 'Required',
        },
        {
          code: 'invalid_type',
          expected: 'object',
          received: 'string',
          path: ['body', 'roles', 0],
          message: 'Expected object, received string',
        },
      ],
    });
  });
});
