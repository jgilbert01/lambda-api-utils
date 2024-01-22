import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

import {
  getUsername, getClaims, getUserGroups, forRole, forOrganization,
} from '../../src/jwt';

describe('utils/index.js', () => {
  afterEach(sinon.restore);

  it('should get claims', () => {
    expect(getClaims({
      authorizer: {
        claims: {
          'cognito:username': 'offlineContext_authorizer_principalId',
        },
      },
    })).to.deep.equal({
      'cognito:username': 'offlineContext_authorizer_principalId',
      'userGroups': [],
      'username': 'offlineContext_authorizer_principalId',
    });

    expect(getClaims({ authorizer: {} })).to.deep.equal({
      userGroups: [],
      username: '',
    });
    expect(getClaims({})).to.deep.equal({
      userGroups: [],
      username: '',
    });
  });

  it('should get username', () => {
    expect(getUsername({
      authorizer: {
        claims: {
          'cognito:username': 'offlineContext_authorizer_principalId',
        },
      },
    })).to.equal('offlineContext_authorizer_principalId');
  });

  it('should get user groups', () => {
    expect(getUserGroups({
      authorizer: {
        claims: {
          'cognito:groups': ['r1', 'r2'],
        },
      },
    })).to.deep.equal(['r1', 'r2']);

    expect(getUserGroups({
      authorizer: {
        claims: {
          'cognito:groups': 'r1,r2',
        },
      },
    })).to.deep.equal(['r1', 'r2']);

    expect(getUserGroups({
      authorizer: {
        claims: {
          'cognito:groups': 'r1',
        },
      },
    })).to.deep.equal(['r1']);
  });

  it('should check role to succeed', () => {
    const req = {
      requestContext: {
        authorizer: {
          claims: {
            'cognito:groups': 'r1,r2',
          },
        },
      },
    };
    const resp = {};
    const next = sinon.spy();

    forRole('r1')(req, resp, next);

    expect(next).to.have.been.calledWith();
  });

  it('should check role to raise error', () => {
    const req = {
      requestContext: {
        authorizer: {
          claims: {
            'cognito:groups': 'r3',
          },
        },
      },
    };
    const resp = {
      error: sinon.spy((data) => data),
    };
    const next = sinon.spy();

    forRole('r1')(req, resp, next);

    expect(resp.error).to.have.been.calledWith(401, 'Unauthorized');
  });

  it('should check org to succeed', () => {
    const req = {
      query: { org: 'o1' },
      requestContext: {
        authorizer: {
          claims: {
            'cognito:groups': 'o1, r1,r2',
          },
        },
      },
    };
    const resp = {};
    const next = sinon.spy();

    forOrganization(req, resp, next);

    expect(next).to.have.been.calledWith();
  });

  it('should check org to raise error', () => {
    const req = {
      query: { org: 'o1' },
      requestContext: {
        authorizer: {
          claims: {
            'cognito:groups': 'r3',
          },
        },
      },
    };
    const resp = {
      error: sinon.spy((data) => data),
    };
    const next = sinon.spy();

    forOrganization(req, resp, next);

    expect(resp.error).to.have.been.calledWith(401, 'Unauthorized');
  });

  it('should require org', () => {
    const req = {
      query: {},
      requestContext: {
        authorizer: {
          claims: {
            'cognito:groups': 'r3',
          },
        },
      },
    };
    const resp = {
      error: sinon.spy((data) => data),
    };
    const next = sinon.spy();

    forOrganization(req, resp, next);

    expect(resp.error).to.have.been.calledWith(401, 'Unauthorized');
  });
});
