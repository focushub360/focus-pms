// craco.config.js - Production & Development Build Configuration
const path = require("path");

module.exports = {
  eslint: {
    enable: false,
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
        ],
      };
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    const validKeys = [
      "allowedHosts", "bonjour", "client", "compress", "devMiddleware",
      "headers", "historyApiFallback", "host", "hot", "ipc", "liveReload",
      "onListening", "open", "port", "proxy", "server", "app",
      "setupExitSignals", "setupMiddlewares", "static", "watchFiles", "webSocketServer"
    ];
    const cleaned = {};
    for (const key of validKeys) {
      if (key in devServerConfig) {
        cleaned[key] = devServerConfig[key];
      }
    }
    if (!cleaned.setupMiddlewares) {
      cleaned.setupMiddlewares = (middlewares) => middlewares;
    }
    return cleaned;
  },
};

