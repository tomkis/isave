import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import SingleChild from 'single-child';
import UrlResolver from 'url';
import request from 'request';

import webpackBEConfig from './webpack/webpack.backend.config.babel.js';
import webpackFEConfig from './webpack/webpack.frontend.config.babel.js';

process.on('uncaughtException', err => console.error(err));

const SERVER_BASE = 'http://localhost';
const CLIENT_PORT = 3000;
const API_PORT = 3001;

let server = null;

const getDevelopmentWebpackBEConfig = webpackConfig => ({
  ...webpackConfig,
  output: {
    ...webpackConfig.output,
    filename: 'server-dev.js'
  },
  debug: true,
  watch: true,
  devtool: 'sourcemap',
  inline: true
});

const getDevelopmentWebpackFEConfig = webpackConfig => {
  const config = {
    ...webpackConfig,
    devtool: 'sourcemap',
    inline: true,
    entry: [
      `webpack-dev-server/client?${SERVER_BASE}:${CLIENT_PORT}`,
      'webpack/hot/only-dev-server', ...webpackConfig.entry
    ],
    plugins: [...webpackConfig.plugins, new webpack.HotModuleReplacementPlugin()]
  };
  config.output.publicPath = `${SERVER_BASE}:${CLIENT_PORT}/`;
  return config;
};

const dumpErrors = errors => {
  errors.forEach(error => {
    console.log(error);
  });
};

const throwError = reason => {
  if (server) {
    server.kill();
  }

  console.error('Killing dev runner');
  throw new Error(reason);
};

webpack(getDevelopmentWebpackBEConfig(webpackBEConfig), (err, stats) => {
  if (err) {
    dumpErrors(err);
    throwError('Fatal error while compiling.');
  }

  const jsonStats = stats.toJson();
  if (jsonStats.errors.length > 0) {
    dumpErrors(jsonStats.errors);
  }
  if (jsonStats.warnings.length > 0) {
    dumpErrors(jsonStats.warnings);
  }

  if (!server) {
    console.info('Starting dev runner');
    server = new SingleChild('node', ['dist/server-dev.js'], {
      stdio: [0, 1, 2],
      env: { ...process.env, NODE_ENV: 'development', PORT: API_PORT }
    });
    server.start();
  } else {
    console.info('Restarting dev runner');
    server.restart();
  }
});

const app = new WebpackDevServer(webpack(getDevelopmentWebpackFEConfig(webpackFEConfig)), {
  contentBase: false, // We don't want to serve ANY content here, since everything is proxied
  publicPath: '/',
  quiet: false,
  noInfo: false,
  hot: true,
  stats: {
    assets: true,
    colors: true,
    version: false,
    hash: true,
    timings: true,
    chunks: false,
    chunkModules: false
  }
});
app.listen(CLIENT_PORT);

app.use('/', (req, res) => {
  const targetUrl = UrlResolver.resolve(`${SERVER_BASE}:${API_PORT}`, req.url);

  req
    .pipe(request(targetUrl))
    .on('error', e => {
      console.error(
        `Problems with proxy. Make sure API is running on ${SERVER_BASE}:${API_PORT}`, e);
      res
        .status(500)
        .send(e);
    })
    .pipe(res);
});
