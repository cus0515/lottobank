// LottoBank TWA Android 프로젝트를 생성하는 빌드 보조 스크립트
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'android-twa');
const core = require(path.join(root, '.tools/npm/node_modules/@bubblewrap/core'));
const Color = require(path.join(root, '.tools/npm/node_modules/color'));
const { generateTwaProject, generateManifestChecksumFile } = require(path.join(root, '.tools/npm/node_modules/@bubblewrap/cli/dist/lib/cmds/shared'));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const manifestUrl = new URL('https://lottobank.pages.dev/manifest.json');
const twa = core.TwaManifest.fromWebManifestJson(manifestUrl, manifest);

twa.packageId = 'com.lottobank.app';
twa.host = 'lottobank.pages.dev';
twa.startUrl = '/';
twa.name = 'LottoBank';
twa.launcherName = 'LottoBank';
twa.appVersionCode = Number(process.env.LOTTOBANK_APP_VERSION_CODE || 2);
twa.appVersionName = process.env.LOTTOBANK_APP_VERSION_NAME || '1.0.1-alpha02';
twa.display = 'standalone';
twa.orientation = 'portrait-primary';
twa.themeColor = new Color('#d61c4e');
twa.themeColorDark = new Color('#0f172a');
twa.navigationColor = new Color('#0f172a');
twa.navigationColorDark = new Color('#0f172a');
twa.navigationDividerColor = new Color('#00000000');
twa.navigationDividerColorDark = new Color('#00000000');
twa.backgroundColor = new Color('#0f172a');
twa.iconUrl = 'https://lottobank.pages.dev/icon-512.png';
twa.maskableIconUrl = 'https://lottobank.pages.dev/icon-512.png';
twa.monochromeIconUrl = undefined;
twa.shortcuts = [];
twa.enableNotifications = true;
twa.features = {};
twa.generatorApp = 'bubblewrap-cli';
twa.signingKey = {
  path: path.join(target, 'lottobank-release.keystore'),
  alias: 'lottobank',
};

class QuietPrompt {
  printMessage(message) {
    if (message) console.log(message);
  }
}

async function main() {
  const keystorePassword = process.env.LOTTOBANK_KEYSTORE_PASSWORD || process.env.BUBBLEWRAP_KEYSTORE_PASSWORD;
  const keyPassword = process.env.LOTTOBANK_KEY_PASSWORD || process.env.BUBBLEWRAP_KEY_PASSWORD || keystorePassword;

  if (!keystorePassword || !keyPassword) {
    throw new Error('LOTTOBANK_KEYSTORE_PASSWORD 또는 BUBBLEWRAP_KEYSTORE_PASSWORD 환경 변수가 필요합니다.');
  }

  fs.mkdirSync(target, { recursive: true });
  await twa.saveToFile(path.join(target, 'twa-manifest.json'));
  const generator = new core.TwaGenerator();
  await generateTwaProject(new QuietPrompt(), generator, target, twa);
  const gradleProperties = path.join(target, 'gradle.properties');
  fs.appendFileSync(gradleProperties, '\nandroid.overridePathCheck=true\n');
  await generateManifestChecksumFile(path.join(target, 'twa-manifest.json'), target);

  const config = new core.Config(process.env.JAVA_HOME, process.env.ANDROID_HOME);
  const jdkHelper = new core.JdkHelper(process, config);
  const keytool = new core.KeyTool(jdkHelper);
  await keytool.createSigningKey({
    fullName: 'Choi Woo Seok',
    organizationalUnit: 'LottoBank',
    organization: 'LottoBank',
    country: 'KR',
    password: keystorePassword,
    keypassword: keyPassword,
    alias: twa.signingKey.alias,
    path: twa.signingKey.path,
  });

  console.log(`generated ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
