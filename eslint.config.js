const baseConfig = require('./packages/config-eslint/base');
const nextConfig = require('./packages/config-eslint/nextjs');

module.exports = [...baseConfig, ...nextConfig];
