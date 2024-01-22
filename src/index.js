export const now = () => Date.now();

// export const toInFilter = (values = []) => ({
//   inFilter: values.filter((v) => v).map((v, i) => `val${i}`).join(', :'),
//   inValues: values.filter((v) => v).reduce((a, c, i) => ({
//     ...a,
//     [`:val${i}`]: c,
//   }), {}),
// });

export * from './connectors';
export * from './jwt';
export * from './mapper';
export * from './middleware';
