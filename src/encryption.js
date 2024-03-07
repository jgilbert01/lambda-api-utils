import omit from 'lodash/omit';
import isEmpty from 'lodash/isEmpty';
import { decryptObject, encryptObject } from 'aws-kms-ee';

// -------------------------------------
// used in commands
// -------------------------------------

const encryptData = ({
  debug,
  eemField = 'eem',
  masterKeyAlias = process.env.MASTER_KEY_ALIAS,
  regions = (process.env.KMS_REGIONS && process.env.KMS_REGIONS.split(',')),
  AES = process.env.AES || true,
}) => async (eem, data) => {
  const result = await encryptObject(data, {
    masterKeyAlias,
    regions,
    ...eem, // fields and overrides
    AES,
  })
    // .tap(debug)
    .tapCatch(debug);

  return {
    ...result.encrypted,
    // storing the metadata with the data
    [eemField]: result.metadata,
  };
};

// -----------------------------------
// used in queries
// -----------------------------------

const decryptData = ({
  debug,
  eemField = 'eem',
  AES = process.env.AES || true,
}) => async (data) => {
  if (isEmpty(data)) return data;
  if (!data[eemField]) return data;

  const result = await decryptObject(omit(data, eemField), {
    ...data[eemField],
    AES,
  })
    // .tap(debug)
    .tapCatch(debug);

  return result.object;
};

export default (opt) => ({
  decrypt: decryptData(opt),
  encrypt: encryptData(opt),
});
