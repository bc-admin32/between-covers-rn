// Patch Node's fs with graceful-fs to avoid EMFILE errors on Windows
// (Metro opens hundreds of files in parallel; Windows hits the descriptor limit fast)
const gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(require('fs'));

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
