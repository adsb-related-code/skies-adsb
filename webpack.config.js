const { CleanWebpackPlugin } = require("clean-webpack-plugin")
const CopyPlugin = require("copy-webpack-plugin")
const HtmlWebPackPlugin = require("html-webpack-plugin")
const path = require("path")
const Dotenv = require("dotenv-webpack")
const FaviconsWebpackPlugin = require('favicons-webpack-plugin')


module.exports = {
  entry: {
    main: path.resolve(__dirname, './src/main.js')
  },
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [

    new FaviconsWebpackPlugin({
      manifest: './src/manifest.json'
    }),

    new Dotenv(),

    new CleanWebpackPlugin({
      verbose: true
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'static',
          to: 'static',
          noErrorOnMissing: true,
        }
      ],
    }),
    new HtmlWebPackPlugin({
      template: './src/index.html'
    }),
  ],
  devServer: {
    open: true
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader"]
      },
      {
        test: /\.css$/,
        loader: "css-loader",
        options: {
          url: {
            filter: (url, resourcePath) => {
              if (url.includes(".svg")) {
                return false
              }
              return true
            }
          }
        }
      },
      {
        test: /\.svg$/i,
        use: ["svg-url-loader"]
      }
    ]
  }
}
