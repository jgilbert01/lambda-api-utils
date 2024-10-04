import {
  logger,
  cors,
  getClaims,
  // forRole,
  // forOrganization,
  errorHandler,
  // serializer,
  validate,
} from '../../src';

import encryption from '../../src/encryption';
import DynamoDBConnector from '../../src/connectors/dynamodb';
import Model, { SCHEMA } from './models/thing';
// import ElementModel from './models/element';

const queryThings = (req, res) => req.namespace.models.thing
  .query({ ...req.params, ...req.query })
  .then((response) => res.status(200)
    .json(response));

const getThing = (req, res) => req.namespace.models.thing
  .get(req.params.id)
  .then((data) => res.status(200).json(data));

const saveThing = (req, res) => req.namespace.models.thing
  .save(req.params.id, req.body)
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
  const { debug } = req.namespace;
  const claims = getClaims(req.requestContext);
  const connector = new DynamoDBConnector({
    debug,
    tableName: process.env.ENTITY_TABLE_NAME,
  });
  const encryptor = encryption({
    ...process.env,
    debug,
  });

  api.app({
    debug: req.namespace.debug,
    models: {
      thing: new Model({
        debug, connector, claims, encryptor,
      }),
      // element: new ElementModel({ debug, connector, claims, encryptor }),
    },
  });

  return next();
};

api.use(cors);
api.use(logger(api));
api.use(errorHandler);
api.use(models);

['', `/api-${process.env.PROJECT}`]
  .forEach((prefix) => api.register((api) => { // eslint-disable-line no-shadow
    api.get('/things', /* forOrganization, */ validate(SCHEMA.query), queryThings);
    api.get('/things/:id', validate(SCHEMA.get), getThing);
    api.put('/things/:id', validate(SCHEMA.save), saveThing);
  }, { prefix }));

// eslint-disable-next-line import/prefer-default-export
export const handle = async (event, context) => api.run(event, context);
