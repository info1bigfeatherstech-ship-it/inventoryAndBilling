require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');

const trimEnv = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

cloudinary.config({
  cloud_name: trimEnv(process.env.CLOUDINARY_CLOUD_NAME),
  api_key: trimEnv(process.env.CLOUDINARY_API_KEY),
  api_secret: trimEnv(process.env.CLOUDINARY_API_SECRET),
  secure: true,
});

cloudinary.api
  .ping()
  .then((r) => {
    console.log('OK', r.status);
    process.exit(0);
  })
  .catch((e) => {
    console.log('FAIL', e.message || e.error?.message);
    process.exit(1);
  });
