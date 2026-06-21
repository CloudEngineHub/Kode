const path = require('node:path')

module.exports = {
  plugins: {
    '@tailwindcss/postcss': {
      base: path.resolve(__dirname),
    },
    autoprefixer: {},
  },
}
