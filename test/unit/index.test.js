import 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

import {
  now, errorHandler,
} from '../../src';

class Response {
  constructor() {
    this.status = sinon.stub().returns(this);
    this.json = sinon.spy((data) => data);
  }
}

describe('utils/index.js', () => {
  afterEach(sinon.restore);

  it('should test successful handle call', async () => {
    sinon.stub(Date, 'now').returns(1600144863435);
    expect(now()).to.equal(1600144863435);
  });

  it('should handle errors', () => {
    const resp1 = new Response();
    const next = sinon.spy();
    errorHandler({ code: 404, message: 'm1' }, undefined, resp1, next);
    expect(resp1.status).to.have.been.calledWith(404);
    expect(resp1.json).to.have.been.calledWith({ Message: 'm1' });
    expect(next).to.have.been.called;

    const resp2 = new Response();
    errorHandler({ message: 'm2' }, undefined, resp2, next);
    expect(resp2.status).to.not.have.been.calledWith(500);
    expect(resp2.json).to.not.have.been.calledWith({ Message: 'm2' });
    expect(next).to.have.been.called;
  });
});
