import zlib from 'zlib';

export const logger = (api) => (req, res, next) => {
  api.app({
    debug: require('debug')(`handler${req.app._event.path.split('/').join(':')}`),
  });

  req.namespace.debug('event: %j', req.app._event);
  // req.namespace.debug(`ctx: %j`, req.app._context);
  // req.namespace.debug(`env: %j`, process.env);

  return next();
};

export const cors = (req, res, next) => {
  res.cors();
  return next();
};

export const errorHandler = (err, req, res, next) => {
  // console.log('errorHandler: ', err.code, err);
  if (err.code) {
    res.status(err.code).json({ Message: err.message });
  }
  next();
};

/* istanbul ignore next */
export const serializer = (body) => {
  //   console.log('serializer: ', body);
  if (!(body instanceof Buffer)) {
    body = JSON.stringify(body);
  }
  return zlib.gzipSync(body).toString('base64');
};

export const validate = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse({
      params: req.params,
      query: req.query,
      body: req.body,
    });
    req.namespace?.debug('%j', { validated });
    return next();
  } catch (error) {
    req.namespace?.debug('%j', { error });
    return res.error(400, { errors: error.issues });
  }
};

// TODO secrets
