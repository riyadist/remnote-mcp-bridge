const { resolve } = require('path');
var glob = require('glob');
var path = require('path');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ESBuildMinifyPlugin } = require('esbuild-loader');
const { ProvidePlugin, BannerPlugin, DefinePlugin } = require('webpack');
const fs = require('fs');

// Kişisel ilk değerler (Eisenhower belge ve etiket kimlikleri, MyDrive klasör kimliği) yalnız yerel dev-2
// derlemesine gömülür. Pazar yeri derlemesinde (manifest kimliği farklı ya da
// REMNOTE_BUILD_TARGET=marketplace) hep null. Kaynak: depo kökündeki local-defaults.json (pakete kopyalanmaz).
function readLocalDefaults() {
  try {
    if (process.env.REMNOTE_BUILD_TARGET === 'marketplace') return null;
    const manifest = JSON.parse(fs.readFileSync(resolve(__dirname, 'public', 'manifest.json'), 'utf8'));
    if (!String(manifest.id || '').endsWith('-dev-2')) return null;
    const file = resolve(__dirname, 'local-defaults.json');
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tags = data.eisenhowerTagIds && typeof data.eisenhowerTagIds === 'object' ? data.eisenhowerTagIds : {};
    const eisenhowerTagIds = {};
    for (const key of ['critical', 'high', 'medium', 'low']) if (typeof tags[key] === 'string') eisenhowerTagIds[key] = tags[key];
    return { eisenhowerDocId: String(data.eisenhowerDocId || ''), mydriveFolderId: String(data.mydriveFolderId || ''), eisenhowerTagIds };
  } catch {
    return null;
  }
}
const LOCAL_DEFAULTS = readLocalDefaults();
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const CopyPlugin = require('copy-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';
const isDevelopment = !isProd;

const fastRefresh = isDevelopment ? new ReactRefreshWebpackPlugin() : null;

const SANDBOX_SUFFIX = '-sandbox';

const config = {
  mode: isProd ? 'production' : 'development',
  watchOptions: {
    poll: 1000,
    aggregateTimeout: 300,
  },
  entry: glob.sync('./src/widgets/**/*.tsx').reduce((obj, el) => {
    const rel = path
      .relative('src/widgets', el)
      .replace(/\.[tj]sx?$/, '')
      .replace(/\\/g, '/');

    obj[rel] = el;
    obj[`${rel}${SANDBOX_SUFFIX}`] = el;
    return obj;
  }, {}),

  output: {
    path: resolve(__dirname, 'dist'),
    filename: `[name].js`,
    publicPath: '',
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|jsx|js)?$/,
        loader: 'esbuild-loader',
        options: {
          loader: 'tsx',
          target: 'es2020',
          minify: false,
        },
      },
      {
        test: /\.css$/i,
        use: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          { loader: 'css-loader', options: { url: false } },
          'postcss-loader',
        ],
      },
    ],
  },
  plugins: [
    isDevelopment
      ? undefined
      : new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
    new HtmlWebpackPlugin({
      templateContent: `
      <body></body>
      <script type="text/javascript">
      const urlSearchParams = new URLSearchParams(window.location.search);
      const queryParams = Object.fromEntries(urlSearchParams.entries());
      const widgetName = queryParams["widgetName"];
      if (widgetName == undefined) {document.body.innerHTML+="Widget ID not specified."}

      const s = document.createElement('script');
      s.type = "module";
      s.src = widgetName+"${SANDBOX_SUFFIX}.js?v=20260703-compact-actions-25865";
      document.body.appendChild(s);
      </script>
    `,
      filename: 'index.html',
      inject: false,
    }),
    new DefinePlugin({
      __RN_LOCAL_DEFAULTS__: JSON.stringify(LOCAL_DEFAULTS),
    }),
    new ProvidePlugin({
      React: 'react',
      reactDOM: 'react-dom',
    }),
    new BannerPlugin({
      banner: (file) => {
        return !file.chunk.name.includes(SANDBOX_SUFFIX) ? 'const IMPORT_META=import.meta;' : '';
      },
      raw: true,
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '' },
        { from: 'README.md', to: '' },
      ],
    }),
    fastRefresh,
  ].filter(Boolean),
};

if (isProd) {
  config.optimization = {
    minimize: isProd,
    minimizer: [new ESBuildMinifyPlugin()],
  };
} else {
  // for more information, see https://webpack.js.org/configuration/dev-server
  config.devServer = {
    port: 8080,
    open: true,
    hot: true,
    compress: true,
    watchFiles: ['src/*'],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'baggage, sentry-trace',
    },
    allowedHosts: 'all',
    host: '0.0.0.0', // Bind to all interfaces (IPv4/IPv6)
  };
}

module.exports = config;
