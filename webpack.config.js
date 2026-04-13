const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'production',
  devtool: 'source-map',

  // 分離されたエントリポイント: Content Script と Service Worker を個別にバンドル
  entry: {
    // Content Script: ページに注入されてテキスト選択を検知
    'content/text-selector': './src/content/text-selector.ts',
    // Service Worker: バックグラウンドで動作する拡張機能のメインプロセス
    'service-worker/background': './src/service-worker/background.ts',
    // Options Page: 設定画面のスクリプト
    'options/options': './src/options/options.ts',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  resolve: {
    extensions: ['.ts', '.js'],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // ビルド用tsconfig: strict設定でコンパイル
              configFile: 'tsconfig.json',
              transpileOnly: false,
            },
          },
        ],
        exclude: /node_modules|__mocks__/,
      },
    ],
  },

  plugins: [
    // manifest.jsonとiconsをdistへコピー
    new CopyPlugin({
      patterns: [
        {
          from: 'public',
          to: '.',
          globOptions: {
            ignore: ['**/*.html'],
          },
        },
      ],
    }),
    // Options PageのHTML生成
    new HtmlWebpackPlugin({
      template: './src/options/options.html',
      filename: 'options/options.html',
      chunks: ['options/options'],
    }),
  ],

  // Manifest V3 では Service Worker は単一ファイルである必要があるため
  // optimization を調整してコードスプリッティングを制限
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },
};
