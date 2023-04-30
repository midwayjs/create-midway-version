const { getPackage, checkPackageUpdate } = require('../index');

// getPackage('@midwayjs/version').then(() => {
//   console.log('done');
// });

checkPackageUpdate().then(() => {
  console.log('done');
})