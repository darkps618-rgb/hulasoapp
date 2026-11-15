#!/usr/bin/env bash
# Creates the android/ project and applies Halo's permissions, deep link and launcher icon.
set -e
npm run build
[ -d android ] || npx cap add android
npx cap sync android
python3 - <<'PY'
import re
p = 'android/app/src/main/AndroidManifest.xml'
s = open(p, encoding='utf-8').read()
perms = ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS']
for perm in perms:
    tag = f'<uses-permission android:name="android.permission.{perm}" />'
    if tag not in s:
        s = s.replace('<application', tag + '\n    <application', 1)
link = '''<intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="com.halo.mobile" android:host="auth" />
            </intent-filter>'''
if 'android:scheme="com.halo.mobile"' not in s:
    s = s.replace('</activity>', '    ' + link + '\n        </activity>', 1)
open(p, 'w', encoding='utf-8').write(s)
PY
npx capacitor-assets generate --android || echo "icon generation skipped"
echo "Android project ready."
