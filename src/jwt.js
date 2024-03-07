import get from 'lodash/get';

export const getClaims = (requestContext) => ({
  ...(requestContext.authorizer?.claims || requestContext.authorizer || {}),
  username: getUsername(requestContext),
  userGroups: getUserGroups(requestContext),
});

// TODO common alternates for cognito:username and cognito:groups

export const getUsername = (requestContext) => requestContext.authorizer?.claims?.sub
  || requestContext.authorizer?.sub
  || get(requestContext, 'authorizer.claims.cognito:username')
  || get(requestContext, 'authorizer.cognito:username')
  || requestContext.authorizer?.principalId
  || '';

export const getUserGroups = (requestContext) => {
  const groups = requestContext.authorizer?.userGroups
    || get(requestContext, 'authorizer.claims.cognito:groups')
    || get(requestContext, 'authorizer.cognito:groups')
    || requestContext.authorizer?.claims?.realm_access?.roles
    || requestContext.authorizer?.realm_access?.roles
    || [];

  if (typeof groups === 'string') {
    return groups.split(',');
  }
  return groups;
};

export const forRole = (role) => (req, res, next) => { // eslint-disable-line consistent-return
  const groups = getUserGroups(req.requestContext);
  if (groups.includes(role)) {
    return next();
  } else {
    res.error(401, 'Unauthorized');
  }
};

export const forOrganization = (req, res, next) => { // eslint-disable-line consistent-return
  const { org } = req.query;
  if (org) {
    const groups = getUserGroups(req.requestContext);
    // console.log('groups: ', groups);
    if (groups.includes(org)) {
      return next();
    } else {
      res.error(401, 'Unauthorized');
    }
  } else {
    // TODO assert power role
    res.error(401, 'Unauthorized');
  }
};
