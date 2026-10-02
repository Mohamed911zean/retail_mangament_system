const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  await flipFuses(join(context.appOutDir, 'small-shop-pos.exe'), {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  })
}
