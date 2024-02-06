import {
  DynamoDBConnector,
  debug,
  cors,
  encryption,
  getClaims,
  forRole,
  forOrganization,
  errorHandler,
  // serializer,
} from '../src';

import Model from './model';

const queryThings = (req, res) => req.namespace.models.thing
  .query({ ...req.params, ...req.query })
  .then((response) => res.status(200)
    .json(response));

const getThing = (req, res) => req.namespace.models.thing
  .get(req.params.id)
  .then((data) => res.status(200).json(data));

const api = require('lambda-api')({
  // isBase64: true,
  // headers: {
  //   'content-encoding': ['gzip'],
  // },
  // serializer: (body) => serializer(body),
  logger: {
    level: 'trace',
    access: true,
    detail: true,
    stack: true,
  },
});

const models = (req, res, next) => {
  const claims = getClaims(req.requestContext);
  const connector = new DynamoDBConnector({
    debug: req.namespace.debug,
    tableName: process.env.ENTITY_TABLE_NAME,
  });

  api.app({
    debug: req.namespace.debug,
    models: {
      thing: new Model({
        debug: req.namespace.debug,
        connector,
        claims,
        encryption: encryption({
          ...process.env,
          debug: req.namespace.debug,
        }),
      }),
    },
  });

  return next();
};

api.use(cors);
api.use(debug(api));
api.use(errorHandler);
api.use(models);

['', `/api-${process.env.PROJECT}`]
  .forEach((prefix) => api.register((api) => { // eslint-disable-line no-shadow
    api.get('/things', /* forOrganization, */ queryThings);
    api.get('/things/:id', getThing);
  }, { prefix }));

// eslint-disable-next-line import/prefer-default-export
export const handle = async (event, context) => api.run(event, context);
