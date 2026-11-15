#!/usr/bin/env bash
# Creates the android/ project, adds Halo's native screen recorder, permissions, deep link and launcher icon.
set -e
npm run build
[ -d android ] || npx cap add android
npx cap sync android

JAVA_DIR=android/app/src/main/java/com/halo/mobile
mkdir -p "$JAVA_DIR"

cat > "$JAVA_DIR/MainActivity.java" <<'JAVA'
package com.halo.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
JAVA

cat > "$JAVA_DIR/ScreenRecorderPlugin.java" <<'JAVA'
package com.halo.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "ScreenRecorder")
public class ScreenRecorderPlugin extends Plugin {
    private PluginCall startCall;
    private PluginCall stopCall;

    @Override
    public void load() {
        ScreenRecordService.listener = new ScreenRecordService.Listener() {
            @Override public void onStarted() {
                if (startCall != null) { startCall.resolve(); startCall = null; }
            }
            @Override public void onStopped(String path) {
                JSObject o = new JSObject();
                o.put("path", path);
                o.put("name", new File(path).getName());
                if (stopCall != null) { stopCall.resolve(o); stopCall = null; }
                else notifyListeners("stopped", o);
            }
            @Override public void onError(String msg) {
                if (startCall != null) { startCall.reject(msg); startCall = null; }
                else if (stopCall != null) { stopCall.reject(msg); stopCall = null; }
                else { JSObject o = new JSObject(); o.put("message", msg); notifyListeners("error", o); }
            }
        };
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4242);
        }
        startCall = call;
        MediaProjectionManager mpm = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "onPermission");
    }

    @ActivityCallback
    private void onPermission(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            startCall = null;
            call.reject("Screen recording permission was not granted");
            return;
        }
        Intent i = new Intent(getContext(), ScreenRecordService.class);
        i.setAction(ScreenRecordService.ACTION_START);
        i.putExtra("resultCode", result.getResultCode());
        i.putExtra("data", result.getData());
        ContextCompat.startForegroundService(getContext(), i);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopCall = call;
        Intent i = new Intent(getContext(), ScreenRecordService.class);
        i.setAction(ScreenRecordService.ACTION_STOP);
        getContext().startService(i);
    }
}
JAVA

cat > "$JAVA_DIR/ScreenRecordService.java" <<'JAVA'
package com.halo.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class ScreenRecordService extends Service {
    public static final String ACTION_START = "com.halo.mobile.START";
    public static final String ACTION_STOP = "com.halo.mobile.STOP";
    private static final String CHANNEL = "halo_recording";

    public interface Listener {
        void onStarted();
        void onStopped(String path);
        void onError(String msg);
    }
    public static Listener listener;

    private MediaProjection projection;
    private MediaRecorder recorder;
    private VirtualDisplay display;
    private File outFile;
    private boolean running = false;
    private boolean finished = false;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if (ACTION_STOP.equals(intent.getAction())) {
            if (running) finish(); else stopSelf();
            return START_NOT_STICKY;
        }
        showForeground();
        try {
            begin(intent);
        } catch (Exception e) {
            fail(e.getMessage() == null ? "Could not start screen recording" : e.getMessage());
        }
        return START_NOT_STICKY;
    }

    private void showForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Halo recording", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        Intent stop = new Intent(this, ScreenRecordService.class).setAction(ACTION_STOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent stopPi = PendingIntent.getService(this, 0, stop, piFlags);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Halo is recording your screen")
            .setContentText("Tap Stop when you are done")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .addAction(0, "Stop", stopPi)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(4242, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(4242, n);
        }
    }

    private void begin(Intent intent) throws Exception {
        int code = intent.getIntExtra("resultCode", Activity.RESULT_CANCELED);
        Intent data = (Intent) intent.getParcelableExtra("data");
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        projection = mpm.getMediaProjection(code, data);
        projection.registerCallback(new MediaProjection.Callback() {
            @Override public void onStop() { if (running) finish(); }
        }, new Handler(Looper.getMainLooper()));

        DisplayMetrics m = getResources().getDisplayMetrics();
        int w = m.widthPixels, h = m.heightPixels;
        if (w > 1080) { h = (int) ((long) h * 1080 / w); w = 1080; }
        w = w & ~1; h = h & ~1;

        File dir = new File(getExternalFilesDir(null), "Halo");
        dir.mkdirs();
        String stamp = new SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.US).format(new Date());
        outFile = new File(dir, "Halo-screen-" + stamp + ".mp4");

        boolean audio = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        recorder = new MediaRecorder();
        if (audio) recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
        if (audio) recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        recorder.setVideoSize(w, h);
        recorder.setVideoFrameRate(30);
        recorder.setVideoEncodingBitRate(6000000);
        recorder.setOutputFile(outFile.getAbsolutePath());
        recorder.prepare();

        display = projection.createVirtualDisplay("Halo", w, h, m.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, recorder.getSurface(), null, null);
        recorder.start();
        running = true;
        if (listener != null) listener.onStarted();
    }

    private void release() {
        try { if (display != null) display.release(); } catch (Exception ignored) {}
        try { if (recorder != null) recorder.release(); } catch (Exception ignored) {}
        try { if (projection != null) projection.stop(); } catch (Exception ignored) {}
        display = null; recorder = null; projection = null;
    }

    private void finish() {
        if (finished) return;
        finished = true; running = false;
        String path = null;
        try {
            recorder.stop();
            path = outFile.getAbsolutePath();
        } catch (Exception ignored) { /* recording too short */ }
        release();
        stopForeground(true);
        stopSelf();
        if (listener != null) {
            if (path != null) listener.onStopped(path);
            else listener.onError("Recording was too short or failed");
        }
    }

    private void fail(String msg) {
        if (finished) return;
        finished = true; running = false;
        release();
        stopForeground(true);
        stopSelf();
        if (listener != null) listener.onError(msg);
    }
}
JAVA

python3 - <<'PY'
p = 'android/app/src/main/AndroidManifest.xml'
s = open(p, encoding='utf-8').read()
perms = ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'FOREGROUND_SERVICE',
         'FOREGROUND_SERVICE_MEDIA_PROJECTION', 'POST_NOTIFICATIONS']
for perm in perms:
    tag = f'<uses-permission android:name="android.permission.{perm}" />'
    if tag not in s:
        s = s.replace('<application', tag + '\n    <application', 1)
svc = '<service android:name=".ScreenRecordService" android:exported="false" android:foregroundServiceType="mediaProjection" />'
if 'ScreenRecordService' not in s:
    s = s.replace('</application>', '    ' + svc + '\n    </application>', 1)
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
