import _omit from 'lodash/omit';

export const sortKeyTransform = (v) => v.split('|')[1];

export const deletedFilter = (i) => !i.deleted;

export const DEFAULT_OMIT_FIELDS = [
  'pk',
  'sk',
  'data',
  'data2',
  'data3',
  'data4',
  'discriminator', // retain ???
  'ttl',
  'latched',
  'deleted',
  'pull',
  'awsregion',
  'aws:rep:updateregion',
  'aws:rep:updatetime',
  'aws:rep:deleting',
  'eem',
];

export const DEFAULT_RENAME = { pk: 'id' };

export const mapper = ({
  defaults = {},
  rename = DEFAULT_RENAME,
  omit = DEFAULT_OMIT_FIELDS,
  transform = {},
} = {}) => async (o, ctx = {}) => {
  const decrypted = (ctx.decrypt && await ctx.decrypt(o)) || o;

  const transformed = {
    ...decrypted,
    ...(await Object.keys(transform).reduce(async (a, k) => {
      a = await a;
      if (decrypted[k]) a[k] = await transform[k](decrypted[k], decrypted, ctx);
      return a;
    }, {})),
  };

  const renamed = {
    ...decrypted,
    ...Object.keys(rename).reduce((a, k) => {
      if (transformed[k]) a[rename[k]] = transformed[k];
      return a;
    }, {}),
  };

  return ({
    ...defaults,
    ..._omit(renamed, omit),
  });
};

// https://advancedweb.hu/how-to-use-async-functions-with-array-reduce-in-javascript/

export const aggregateMapper = ({
  aggregate,
  cardinality,
  mappers,
  delimiter = '|',
}) => async (items, /* istanbul ignore next */ ctx = {}) => items
  .filter(deletedFilter)
  .reduce(async (a, c) => {
    a = await a;
    const mappings = mappers[c.discriminator] || /* istanbul ignore next */ (async (o) => o);
    const mapped = await mappings(c, ctx);

    if (c.discriminator === aggregate) {
      return {
        ...mapped,
        ...a,
      };
    } else {
      const role = c.sk.split(delimiter)[0];
      if (cardinality[role] > 1) {
        if (!a[role]) {
          a[role] = [mapped];
        } else {
          a[role].push(mapped);
        }
      } else {
        a[role] = mapped;
      }

      return a;
    }
  }, {});
